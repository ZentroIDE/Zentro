// SPDX-License-Identifier: GPL-3.0-only

import { useState, useEffect } from 'react';
import { models } from '../../wailsjs/go/models';
import { getApiGateway } from '../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../shared/kernel';
import { getErrorMessage } from '../lib/errors';
import { DRIVER } from '../lib/constants';
import {
    getProvider,
    makeDefaultForm,
    parseConnectionString,
    validateConnectionForm,
} from '../lib/providers';
import type { ConnectionProfile } from '../types/connection';

export type TestResult = 'idle' | 'ok' | 'error';

export interface UseConnectionFormOptions {
    profile?: ConnectionProfile | null;
    isOpen?: boolean;
    existingNames?: string[];
    onSaveProfile?: (profile: ConnectionProfile) => Promise<void>;
    onSaved?: () => void;
    onClose?: () => void;
}

export interface UseConnectionFormReturn {
    formData: Partial<ConnectionProfile>;
    connString: string;
    testing: boolean;
    saving: boolean;
    testResult: TestResult;
    errorMsg: string;
    successMsg: string;
    isEditing: boolean;
    selectedProvider: string;
    handleDriverChange: (key: string) => void;
    handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    handleParseConnectionString: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleTest: () => Promise<void>;
    handleSave: (e: React.SyntheticEvent) => Promise<void>;
    resetFeedback: () => void;
    resetForm: () => void;
    setFormFromProfile: (profile: ConnectionProfile) => void;
}

const DEFAULT_CONNECTION_PROFILE: ConnectionProfile = {
    name: '',
    driver: '',
    host: '',
    port: 0,
    db_name: '',
    username: '',
    password: '',
    ssl_mode: '',
    connect_timeout: 10,
    save_password: false,
    encrypt_password: false,
    show_all_schemas: false,
    trust_server_cert: false,
    tls_min_version: '',
    tls_legacy_ciphers: false,
    ssh_enabled: false,
    ssh_host: '',
    ssh_port: 22,
    ssh_user: '',
    ssh_auth: 'password',
    ssh_key_path: '',
    ssh_password: '',
    ssh_passphrase: '',
};

function toConnectionProfileModel(formData: Partial<ConnectionProfile>): models.ConnectionProfile {
    return new models.ConnectionProfile({
        ...DEFAULT_CONNECTION_PROFILE,
        ...formData,
    });
}

export function useConnectionForm({
    profile,
    isOpen = true,
    existingNames = [],
    onSaveProfile,
    onSaved,
    onClose,
}: UseConnectionFormOptions): UseConnectionFormReturn {
    const [formData, setFormData] = useState<Partial<ConnectionProfile>>(
        makeDefaultForm(DRIVER.POSTGRES),
    );
    const [connString, setConnString] = useState('');
    const [testing, setTesting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testResult, setTestResult] = useState<TestResult>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const isEditing = Boolean(profile);

    // The profile being edited legitimately keeps its own name — exclude it
    // so a save without a rename doesn't fail the uniqueness check.
    const otherNames = existingNames.filter(name => !profile || name !== profile.name);

    useEffect(() => {
        if (!isOpen) return;
        setFormData(profile ? { ...profile } : makeDefaultForm(DRIVER.POSTGRES));
        setConnString('');
        setErrorMsg('');
        setSuccessMsg('');
        setTestResult('idle');
    }, [isOpen, profile]);

    const resetFeedback = () => {
        setTestResult('idle');
        setSuccessMsg('');
        setErrorMsg('');
    };

    const resetForm = () => {
        setFormData(makeDefaultForm(DRIVER.POSTGRES));
        setConnString('');
        resetFeedback();
    };

    const setFormFromProfile = (profile: ConnectionProfile) => {
        setFormData({ ...profile });
        setConnString('');
        resetFeedback();
    };

    const handleDriverChange = (key: string) => {
        if (isEditing) return;
        const p = getProvider(key);
        setFormData(prev => ({
            ...prev,
            driver: key,
            port: p.defaultPort ?? prev.port,
            ssl_mode: p.defaultSsl,
        }));
        // A pasted URI belongs to the provider it was written for.
        setConnString('');
        resetFeedback();
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            const checked = (e.target as HTMLInputElement).checked;
            setFormData(prev => {
                if (name === 'save_password') {
                    return {
                        ...prev,
                        save_password: checked,
                        encrypt_password: checked ? (prev.encrypt_password ?? true) : false,
                    };
                }
                if (name === 'encrypt_password') {
                    return {
                        ...prev,
                        encrypt_password: checked && (prev.save_password ?? true),
                    };
                }
                return { ...prev, [name]: checked };
            });
        } else if (name === 'port' || name === 'connect_timeout' || name === 'ssh_port') {
            setFormData(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
        resetFeedback();
    };

    const handleParseConnectionString = (e: React.ChangeEvent<HTMLInputElement>) => {
        const uri = e.target.value;
        setConnString(uri);
        if (!uri.trim()) return;
        const updates = parseConnectionString(uri, formData.name, formData.driver);
        if (Object.keys(updates).length > 0) {
            setFormData(prev => ({ ...prev, ...updates }));
            resetFeedback();
        }
    };

    const handleTest = async () => {
        const err = validateConnectionForm(formData, otherNames);
        if (err) {
            setErrorMsg(err);
            return;
        }
        setTesting(true);
        setErrorMsg('');
        setSuccessMsg('');
        setTestResult('idle');
        try {
            unwrapOrThrow(
                await getApiGateway().connection.testConnection(toConnectionProfileModel(formData)),
            );
            setSuccessMsg('Connection successful!');
            setTestResult('ok');
        } catch (err: unknown) {
            setErrorMsg(getErrorMessage(err));
            setTestResult('error');
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        const err = validateConnectionForm(formData, otherNames);
        if (err) {
            setErrorMsg(err);
            return;
        }
        setSaving(true);
        setErrorMsg('');
        try {
            const profileModel = toConnectionProfileModel(formData);
            if (onSaveProfile) {
                await onSaveProfile(profileModel as ConnectionProfile);
            } else {
                unwrapOrThrow(await getApiGateway().connection.saveConnection(profileModel));
            }
            onSaved?.();
            onClose?.();
        } catch (err: unknown) {
            setErrorMsg(getErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return {
        formData,
        connString,
        testing,
        saving,
        testResult,
        errorMsg,
        successMsg,
        isEditing,
        selectedProvider: formData.driver ?? '',
        handleDriverChange,
        handleChange,
        handleParseConnectionString,
        handleTest,
        handleSave,
        resetFeedback,
        resetForm,
        setFormFromProfile,
    };
}
