// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { AlertCircle, Antenna, CheckCircle, FolderOpen, HelpCircle, Rss } from 'lucide-react';
import { cn } from '../../lib/cn';
import { DRIVER } from '../../lib/constants';
import { getProvider } from '../../lib/providers';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import { getErrorMessage } from '../../lib/errors';
import { TestResult } from '../../hooks/useConnectionForm';
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Spinner,
    Switch,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '../ui';
import type { ConnectionProfile } from '../../types/connection';

const fieldInputClass = 'w-full h-6 bg-background!';
const labelClass = 'mb-0.5 block text-label text-muted-foreground';

/** Select items cannot carry an empty value, so "no override" uses a sentinel
 * that is mapped back to '' (driver default) before it reaches form state. */
const TLS_VERSION_DEFAULT = 'default';

/** Copy for provider-specific extra toggles that only carry a `label` on the
 * provider registry. Keyed by ConnectionProfile field name. */
const EXTRA_FIELD_DESCRIPTIONS: Partial<Record<string, string>> = {
    trust_server_cert: "Skip validating the server's TLS certificate.",
};

interface AdvancedToggleProps {
    title: string;
    description?: string;
    checked: boolean;
    disabled?: boolean;
    onCheckedChange: (checked: boolean) => void;
}

const AdvancedToggle: React.FC<AdvancedToggleProps> = ({
    title,
    description,
    checked,
    disabled,
    onCheckedChange,
}) => (
    <div className='flex items-start justify-between gap-3 py-2'>
        <div className='min-w-0'>
            <div className='text-label font-medium text-foreground'>{title}</div>
            {description && <div className='text-label text-muted-foreground'>{description}</div>}
        </div>
        <Switch
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            aria-label={title}
            className='mt-0.5 shrink-0'
        />
    </div>
);

interface ConnectionFormProps {
    formData: Partial<ConnectionProfile>;
    connString: string;
    testing: boolean;
    saving: boolean;
    testResult: TestResult;
    errorMsg: string;
    successMsg: string;
    isEditing: boolean;
    showUriField?: boolean;
    hideActions?: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onConnStringChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onTest: () => void;
    onSave: (e: React.SyntheticEvent) => void;
    onCancel: () => void;
}

export const ConnectionForm: React.FC<ConnectionFormProps> = ({
    formData,
    connString,
    testing,
    saving,
    errorMsg,
    successMsg,
    isEditing,
    showUriField = false,
    hideActions = false,
    onChange,
    onConnStringChange,
    onTest,
    onSave,
    onCancel,
}) => {
    const [browseError, setBrowseError] = React.useState('');

    const emitCheckboxChange = React.useCallback(
        (name: string, checked: boolean) => {
            onChange({
                target: {
                    name,
                    type: 'checkbox',
                    checked,
                    value: checked ? 'on' : 'off',
                },
            } as React.ChangeEvent<HTMLInputElement>);
        },
        [onChange],
    );

    const handleBrowseSQLiteFile = React.useCallback(async () => {
        setBrowseError('');
        try {
            const picked = unwrapOrThrow(await getApiGateway().connection.pickSQLiteFile());
            if (!picked) return;
            onChange({
                target: { name: 'db_name', value: picked },
            } as React.ChangeEvent<HTMLInputElement>);
        } catch (err: unknown) {
            setBrowseError(`Could not pick a database file: ${getErrorMessage(err)}`);
        }
    }, [onChange]);

    const provider = getProvider(formData.driver ?? DRIVER.POSTGRES);
    const { requiresHost, requiresAuth, extraFields = [] } = provider;

    // Editing a saved connection prefills the password straight from the OS
    // keychain, so an empty field here means the secret is gone — say so
    // rather than letting the save look fine and every later connect fail
    // with "password authentication failed".
    const missingStoredPassword =
        isEditing && requiresAuth && Boolean(formData.save_password) && !formData.password;

    return (
        <form onSubmit={onSave} className='flex min-h-0 flex-1 flex-col'>
            <div className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4'>
                {showUriField && provider.uri && (
                    <div className='border-b border-border pb-2.5'>
                        <label className={labelClass}>Connection string (URI)</label>
                        <Input
                            value={connString}
                            onChange={onConnStringChange}
                            placeholder={provider.uri.placeholder}
                            className={cn(fieldInputClass, ' text-label')}
                        />
                    </div>
                )}

                <div className='flex flex-col gap-2' data-tour='connection-db-info'>
                    <div>
                        <label className={labelClass}>
                            Connection name <span className='text-destructive'>*</span>
                        </label>
                        <Input
                            name='name'
                            value={formData.name || ''}
                            onChange={onChange}
                            placeholder='e.g. Production'
                            autoFocus={!isEditing}
                            className={fieldInputClass}
                        />
                    </div>

                    <div className='flex flex-col gap-2 sm:flex-row'>
                        <div className='flex-1 sm:basis-3/5'>
                            <label className={labelClass}>
                                Host {requiresHost && <span className='text-destructive'>*</span>}
                            </label>
                            <Input
                                name='host'
                                value={formData.host || ''}
                                onChange={onChange}
                                placeholder='localhost'
                                disabled={!requiresHost}
                                className={cn(fieldInputClass, !requiresHost && 'opacity-40')}
                            />
                        </div>
                        <div className='sm:basis-2/5'>
                            <label className={labelClass}>
                                Port {requiresHost && <span className='text-destructive'>*</span>}
                            </label>
                            <Input
                                type='number'
                                name='port'
                                value={requiresHost ? formData.port || '' : ''}
                                onChange={onChange}
                                min={1}
                                max={65535}
                                disabled={!requiresHost}
                                placeholder={!requiresHost ? '-' : ''}
                                className={cn(fieldInputClass, !requiresHost && 'opacity-40')}
                            />
                        </div>
                    </div>

                    <div className='flex flex-col gap-2 sm:flex-row'>
                        <div className='flex-1 sm:basis-3/5'>
                            <label className={labelClass}>
                                Username{' '}
                                {requiresAuth && <span className='text-destructive'>*</span>}
                            </label>
                            <Input
                                name='username'
                                value={formData.username || ''}
                                onChange={onChange}
                                placeholder={
                                    requiresAuth ? (provider.usernamePlaceholder ?? '') : '-'
                                }
                                disabled={!requiresAuth}
                                autoComplete='username'
                                className={cn(fieldInputClass, !requiresAuth && 'opacity-40')}
                            />
                        </div>
                        <div className='flex-1 sm:basis-2/5'>
                            <label className={labelClass}>Password</label>
                            <Input
                                type='password'
                                name='password'
                                value={formData.password || ''}
                                onChange={onChange}
                                disabled={!requiresAuth}
                                autoComplete='current-password'
                                className={cn(fieldInputClass, !requiresAuth && 'opacity-40')}
                            />
                        </div>
                    </div>
                    {missingStoredPassword && (
                        <div className='flex items-start gap-1.5 text-label text-warning'>
                            <AlertCircle size={12} className='mt-0.5 shrink-0' />
                            <span>
                                No password is stored for this connection. Enter it again to save it
                                to the OS keychain — environments bound to it cannot connect until
                                you do.
                            </span>
                        </div>
                    )}

                    <div>
                        <label className={cn(labelClass, 'flex items-center gap-1')}>
                            {requiresHost ? 'Bootstrap database' : 'Database file'}
                            {requiresHost ? (
                                <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className='cursor-help text-muted-foreground/70'>
                                                <HelpCircle size={11} />
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent className='max-w-64'>
                                            Optional. Only used to open the connection when testing
                                            it or listing its databases. Which database a project
                                            works against is chosen per environment, not here.
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            ) : (
                                <span className='text-destructive'>*</span>
                            )}
                        </label>
                        {requiresHost ? (
                            <Input
                                name='db_name'
                                value={formData.db_name || ''}
                                onChange={onChange}
                                placeholder={provider.bootstrapDbPlaceholder ?? ''}
                                className={fieldInputClass}
                            />
                        ) : (
                            <div className='flex gap-1.5'>
                                <Input
                                    name='db_name'
                                    value={formData.db_name || ''}
                                    onChange={onChange}
                                    placeholder='/path/to/file.db'
                                    className={fieldInputClass}
                                />
                                <Button
                                    type='button'
                                    variant='ghost'
                                    size='icon'
                                    className='h-6 w-6 shrink-0'
                                    title='Browse for a SQLite file'
                                    aria-label='Browse for a SQLite file'
                                    onClick={handleBrowseSQLiteFile}
                                >
                                    <FolderOpen size={13} />
                                </Button>
                            </div>
                        )}
                        {browseError && (
                            <div className='mt-1 flex items-start gap-1.5 text-label text-destructive'>
                                <AlertCircle size={12} className='mt-0.5 shrink-0' />
                                <span>{browseError}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className='mt-1 text-label font-semibold uppercase tracking-wide text-muted-foreground/80'>
                    Advanced
                </div>
                {requiresHost && (
                    <div className='flex items-center justify-between'>
                        <label className={labelClass}>SSL mode</label>
                        <Select
                            value={formData.ssl_mode || 'disable'}
                            onValueChange={value => {
                                onChange({
                                    target: { name: 'ssl_mode', value },
                                } as React.ChangeEvent<HTMLSelectElement>);
                            }}
                        >
                            <SelectTrigger
                                className={cn(
                                    fieldInputClass,
                                    'w-6/12 border border-(--border-panel)!',
                                )}
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value='disable'>Disable</SelectItem>
                                <SelectItem value='require'>Require</SelectItem>
                                <SelectItem value='verify-ca'>Verify CA</SelectItem>
                                <SelectItem value='verify-full'>Verify Full</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}
                {requiresHost && (
                    <div className='flex items-center justify-between'>
                        <label className={labelClass}>TLS minimum version</label>
                        <Select
                            value={formData.tls_min_version || TLS_VERSION_DEFAULT}
                            onValueChange={value => {
                                onChange({
                                    target: {
                                        name: 'tls_min_version',
                                        value: value === TLS_VERSION_DEFAULT ? '' : value,
                                    },
                                } as React.ChangeEvent<HTMLSelectElement>);
                            }}
                        >
                            <SelectTrigger
                                className={cn(
                                    fieldInputClass,
                                    'w-6/12 border border-(--border-panel)!',
                                )}
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={TLS_VERSION_DEFAULT}>Driver default</SelectItem>
                                <SelectItem value='1.0'>TLS 1.0</SelectItem>
                                <SelectItem value='1.1'>TLS 1.1</SelectItem>
                                <SelectItem value='1.2'>TLS 1.2</SelectItem>
                                <SelectItem value='1.3'>TLS 1.3</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}
                <div>
                    {requiresHost && (
                        <AdvancedToggle
                            title='Legacy TLS ciphers'
                            description='Also offer older cipher suites. Turn on for old servers that fail with "TLS handshake failed".'
                            checked={formData.tls_legacy_ciphers ?? false}
                            onCheckedChange={checked =>
                                emitCheckboxChange('tls_legacy_ciphers', checked)
                            }
                        />
                    )}
                    <AdvancedToggle
                        title='Save password'
                        description='Remember the password next time, stored in the OS keychain.'
                        checked={formData.save_password ?? true}
                        onCheckedChange={checked => emitCheckboxChange('save_password', checked)}
                    />
                    <AdvancedToggle
                        title='Encrypt password'
                        description='Encrypt the password when stored on disk.'
                        checked={formData.encrypt_password ?? true}
                        disabled={!(formData.save_password ?? true)}
                        onCheckedChange={checked => emitCheckboxChange('encrypt_password', checked)}
                    />
                    {requiresHost && (
                        <AdvancedToggle
                            title='Show all schemas'
                            description='Show every schema instead of just the default one.'
                            checked={formData.show_all_schemas ?? false}
                            onCheckedChange={checked =>
                                emitCheckboxChange('show_all_schemas', checked)
                            }
                        />
                    )}
                    {extraFields.map(field => (
                        <AdvancedToggle
                            key={field.name as string}
                            title={field.label}
                            description={EXTRA_FIELD_DESCRIPTIONS[field.name as string]}
                            checked={(formData[field.name] as boolean) ?? false}
                            onCheckedChange={checked =>
                                emitCheckboxChange(field.name as string, checked)
                            }
                        />
                    ))}
                </div>

                {requiresHost && (
                    <div className='flex flex-col gap-2'>
                        <AdvancedToggle
                            title='Connect through an SSH tunnel'
                            description='Reach the database via an SSH server. Host above is then the database address as seen from that server.'
                            checked={formData.ssh_enabled ?? false}
                            onCheckedChange={checked => emitCheckboxChange('ssh_enabled', checked)}
                        />
                        {formData.ssh_enabled && (
                            <div className='flex flex-col gap-2' data-testid='ssh-tunnel-fields'>
                                <div className='flex flex-col gap-2 sm:flex-row'>
                                    <div className='flex-1 sm:basis-3/5'>
                                        <label className={labelClass}>
                                            SSH host <span className='text-destructive'>*</span>
                                        </label>
                                        <Input
                                            name='ssh_host'
                                            value={formData.ssh_host || ''}
                                            onChange={onChange}
                                            placeholder='bastion.example.com'
                                            className={fieldInputClass}
                                        />
                                    </div>
                                    <div className='sm:basis-2/5'>
                                        <label className={labelClass}>SSH port</label>
                                        <Input
                                            type='number'
                                            name='ssh_port'
                                            value={formData.ssh_port || ''}
                                            onChange={onChange}
                                            min={1}
                                            max={65535}
                                            placeholder='22'
                                            className={fieldInputClass}
                                        />
                                    </div>
                                </div>
                                <div className='flex flex-col gap-2 sm:flex-row'>
                                    <div className='flex-1 sm:basis-3/5'>
                                        <label className={labelClass}>
                                            SSH user <span className='text-destructive'>*</span>
                                        </label>
                                        <Input
                                            name='ssh_user'
                                            value={formData.ssh_user || ''}
                                            onChange={onChange}
                                            autoComplete='off'
                                            className={fieldInputClass}
                                        />
                                    </div>
                                    <div className='flex-1 sm:basis-2/5'>
                                        <label className={labelClass}>Authentication</label>
                                        <Select
                                            value={formData.ssh_auth || 'password'}
                                            onValueChange={value => {
                                                onChange({
                                                    target: { name: 'ssh_auth', value },
                                                } as React.ChangeEvent<HTMLSelectElement>);
                                            }}
                                        >
                                            <SelectTrigger
                                                className={cn(
                                                    fieldInputClass,
                                                    'border border-(--border-panel)!',
                                                )}
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value='password'>Password</SelectItem>
                                                <SelectItem value='key'>Private key</SelectItem>
                                                <SelectItem value='agent'>SSH agent</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                {(formData.ssh_auth || 'password') === 'password' && (
                                    <div>
                                        <label className={labelClass}>
                                            SSH password <span className='text-destructive'>*</span>
                                        </label>
                                        <Input
                                            type='password'
                                            name='ssh_password'
                                            value={formData.ssh_password || ''}
                                            onChange={onChange}
                                            autoComplete='off'
                                            className={fieldInputClass}
                                        />
                                    </div>
                                )}
                                {formData.ssh_auth === 'key' && (
                                    <>
                                        <div>
                                            <label className={labelClass}>
                                                Private key file{' '}
                                                <span className='text-destructive'>*</span>
                                            </label>
                                            <Input
                                                name='ssh_key_path'
                                                value={formData.ssh_key_path || ''}
                                                onChange={onChange}
                                                placeholder='~/.ssh/id_ed25519'
                                                className={fieldInputClass}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Key passphrase</label>
                                            <Input
                                                type='password'
                                                name='ssh_passphrase'
                                                value={formData.ssh_passphrase || ''}
                                                onChange={onChange}
                                                placeholder='Only if the key is encrypted'
                                                autoComplete='off'
                                                className={fieldInputClass}
                                            />
                                        </div>
                                    </>
                                )}
                                {formData.ssh_auth === 'agent' && (
                                    <div className='text-label text-muted-foreground'>
                                        Uses the keys loaded in your running SSH agent (OpenSSH
                                        agent on Windows, SSH_AUTH_SOCK on macOS and Linux).
                                    </div>
                                )}
                                <div className='text-label text-muted-foreground'>
                                    The SSH server's host key is trusted on first connect and pinned
                                    afterwards. SSH secrets are stored in the OS keychain when Save
                                    password is on.
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Pinned outside the scroll area so Test / Cancel / Save never scroll out of view. */}
            <div className='flex shrink-0 flex-col gap-2 px-4 py-3'>
                {errorMsg && (
                    <div className='flex items-start gap-1.5 rounded-md border border-destructive/20 bg-destructive/10 px-2.5 py-1.5 text-label text-destructive'>
                        <AlertCircle size={12} className='mt-px shrink-0' />
                        <span className='flex-1 break-words'>{errorMsg}</span>
                    </div>
                )}
                {successMsg && (
                    <div className='flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1.5 text-label text-success'>
                        <span className='flex-1'>{successMsg}</span>
                    </div>
                )}

                {!hideActions && (
                    <div className='flex gap-1.5'>
                        <Button
                            type='button'
                            className='px-2'
                            variant='ghost'
                            onClick={onTest}
                            disabled={testing}
                            data-tour='connection-test'
                        >
                            {testing ? (
                                <>
                                    <Spinner size={11} className='mr-1' />
                                    Testing...
                                </>
                            ) : (
                                <>
                                    <Rss size={11} className='mr-1' />
                                    Test
                                </>
                            )}
                        </Button>
                        <div className='flex-1' />
                        <Button type='button' variant='ghost' onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button
                            type='submit'
                            variant='default'
                            className='min-w-30'
                            disabled={saving}
                        >
                            {saving ? (
                                <>
                                    <Spinner size={11} className='mr-1 text-white' /> Saving...
                                </>
                            ) : (
                                'Save'
                            )}
                        </Button>
                    </div>
                )}
            </div>
        </form>
    );
};
