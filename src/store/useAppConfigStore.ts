let loadingTimeout: NodeJS.Timeout | undefined;
import { invoke } from '@tauri-apps/api/core';
import { create } from './create';
import { AppConfig, GpuThreads } from '../types/app-status.ts';
import { useAppStateStore } from './appStateStore.ts';
import { displayMode, modeType } from './types.ts';
import { Language } from '@app/i18initializer.ts';
import { toggleDeviceExclusion, useMiningStore } from '@app/store/useMiningStore.ts';
import { changeLanguage } from 'i18next';
import { sidebarTowerOffset, TOWER_CANVAS_ID, setUITheme } from '@app/store/useUIStore.ts';
import { useMiningMetricsStore } from '@app/store/useMiningMetricsStore.ts';
import { pauseMining, startMining, stopMining } from '@app/store/miningStoreActions.ts';

import { loadTowerAnimation } from '@tari-project/tari-tower';

type State = Partial<AppConfig> & {
    visualModeToggleLoading: boolean;
};
interface SetModeProps {
    mode: modeType;
    customGpuLevels?: GpuThreads[];
    customCpuLevels?: number;
}

interface Actions {
    setAllowTelemetry: (allowTelemetry: boolean) => Promise<void>;
    setCpuMiningEnabled: (enabled: boolean) => Promise<void>;
    setGpuMiningEnabled: (enabled: boolean) => Promise<void>;
    setP2poolEnabled: (p2poolEnabled: boolean) => Promise<void>;
    setMoneroAddress: (moneroAddress: string) => Promise<void>;
    setMineOnAppStart: (mineOnAppStart: boolean) => Promise<void>;
    setMode: (params: SetModeProps) => Promise<void>;
    setApplicationLanguage: (applicationLanguage: Language) => Promise<void>;
    setShouldAlwaysUseSystemLanguage: (shouldAlwaysUseSystemLanguage: boolean) => Promise<void>;
    setUseTor: (useTor: boolean) => Promise<void>;
    setShouldAutoLaunch: (shouldAutoLaunch: boolean) => Promise<void>;
    setAutoUpdate: (autoUpdate: boolean) => Promise<void>;
    setMonerodConfig: (use_monero_fail: boolean, monero_nodes: string[]) => Promise<void>;
    setTheme: (theme: displayMode) => Promise<void>;
    setShowExperimentalSettings: (showExperimentalSettings: boolean) => Promise<void>;
    setP2poolStatsServerPort: (port: number | null) => Promise<void>;
    setPreRelease: (preRelease: boolean) => Promise<void>;
}

type AppConfigStoreState = State & Actions;

const initialState: State = {
    visualModeToggleLoading: false,
    config_version: 0,
    config_file: undefined,
    mode: 'Eco',
    mine_on_app_start: false,
    p2pool_enabled: false,
    last_binaries_update_timestamp: '0',
    allow_telemetry: false,
    anon_id: '',
    monero_address: '',
    gpu_mining_enabled: true,
    cpu_mining_enabled: true,
    sharing_enabled: true,
    paper_wallet_enabled: true,
    custom_power_levels_enabled: true,
    use_tor: true,
    auto_update: false,
    monero_address_is_generated: false,
    mmproxy_use_monero_fail: false,
    mmproxy_monero_nodes: ['https://xmr-01.tari.com'],
    visual_mode: true,
    custom_max_cpu_usage: undefined,
    custom_max_gpu_usage: [],
    show_experimental_settings: false,
    p2pool_stats_server_port: null,
    pre_release: false,
};

export const useAppConfigStore = create<AppConfigStoreState>()((set) => ({
    ...initialState,
    setShouldAutoLaunch: async (shouldAutoLaunch) => {
        set({ should_auto_launch: shouldAutoLaunch });
        invoke('set_should_auto_launch', { shouldAutoLaunch }).catch((e) => {
            const appStateStore = useAppStateStore.getState();
            console.error('Could not set auto launch', e);
            appStateStore.setError('Could not change auto launch');
            set({ should_auto_launch: !shouldAutoLaunch });
        });
    },
    setMineOnAppStart: async (mineOnAppStart) => {
        set({ mine_on_app_start: mineOnAppStart });
        invoke('set_mine_on_app_start', { mineOnAppStart }).catch((e) => {
            const appStateStore = useAppStateStore.getState();
            console.error('Could not set mine on app start', e);
            appStateStore.setError('Could not change mine on app start');
            set({ mine_on_app_start: !mineOnAppStart });
        });
    },
    setShouldAlwaysUseSystemLanguage: async (shouldAlwaysUseSystemLanguage: boolean) => {
        set({ should_always_use_system_language: shouldAlwaysUseSystemLanguage });
        invoke('set_should_always_use_system_language', { shouldAlwaysUseSystemLanguage }).catch((e) => {
            const appStateStore = useAppStateStore.getState();
            console.error('Could not set should always use system language', e);
            appStateStore.setError('Could not change system language');
            set({ should_always_use_system_language: !shouldAlwaysUseSystemLanguage });
        });
    },
    setApplicationLanguage: async (applicationLanguage: Language) => {
        const prevApplicationLanguage = useAppConfigStore.getState().application_language;
        set({ application_language: applicationLanguage });
        invoke('set_application_language', { applicationLanguage })
            .then(() => {
                changeLanguage(applicationLanguage);
            })
            .catch((e) => {
                const appStateStore = useAppStateStore.getState();
                console.error('Could not set application language', e);
                appStateStore.setError('Could not change application language');
                set({ application_language: prevApplicationLanguage });
            });
    },
    setAllowTelemetry: async (allowTelemetry) => {
        set({ allow_telemetry: allowTelemetry });
        invoke('set_allow_telemetry', { allowTelemetry }).catch((e) => {
            const appStateStore = useAppStateStore.getState();
            console.error('Could not set telemetry mode to ', allowTelemetry, e);
            appStateStore.setError('Could not change telemetry mode');
            set({ allow_telemetry: !allowTelemetry });
        });
    },
    setCpuMiningEnabled: async (enabled) => {
        set({ cpu_mining_enabled: enabled });
        const miningState = useMiningStore.getState();
        const metricsState = useMiningMetricsStore.getState();
        if (metricsState.cpu_mining_status.is_mining || metricsState.gpu_mining_status.is_mining) {
            await pauseMining();
        }
        invoke('set_cpu_mining_enabled', { enabled })
            .then(async () => {
                if (miningState.miningInitiated && (enabled || metricsState.gpu_mining_status.is_mining)) {
                    await startMining();
                } else {
                    await stopMining();
                }
            })
            .catch((e) => {
                const appStateStore = useAppStateStore.getState();
                console.error('Could not set CPU mining enabled', e);
                appStateStore.setError('Could not change CPU mining enabled');
                set({ cpu_mining_enabled: !enabled });

                if (
                    miningState.miningInitiated &&
                    !metricsState.cpu_mining_status.is_mining &&
                    !metricsState.gpu_mining_status.is_mining
                ) {
                    void stopMining();
                }
            });
    },
    setGpuMiningEnabled: async (enabled) => {
        set({ gpu_mining_enabled: enabled });
        const miningState = useMiningStore.getState();
        const metricsState = useMiningMetricsStore.getState();
        const gpu_devices = metricsState.gpu_devices;
        if (metricsState.cpu_mining_status.is_mining || metricsState.gpu_mining_status.is_mining) {
            await pauseMining();
        }

        try {
            await invoke('set_gpu_mining_enabled', { enabled });
            if (miningState.miningInitiated && (metricsState.cpu_mining_status.is_mining || enabled)) {
                await startMining();
            } else {
                void stopMining();
            }
            if (enabled && gpu_devices.every((device) => device.settings.is_excluded)) {
                for (const device of gpu_devices) {
                    await toggleDeviceExclusion(device.device_index, false);
                }
            }
        } catch (e) {
            const appStateStore = useAppStateStore.getState();
            console.error('Could not set GPU mining enabled', e);
            appStateStore.setError('Could not change GPU mining enabled');
            set({ gpu_mining_enabled: !enabled });

            if (
                miningState.miningInitiated &&
                !metricsState.cpu_mining_status.is_mining &&
                !metricsState.gpu_mining_status.is_mining
            ) {
                void stopMining();
            }
        }
    },
    setP2poolEnabled: async (p2poolEnabled) => {
        set({ p2pool_enabled: p2poolEnabled });
        invoke('set_p2pool_enabled', { p2poolEnabled }).catch((e) => {
            const appStateStore = useAppStateStore.getState();
            console.error('Could not set P2pool enabled', e);
            appStateStore.setError('Could not change P2pool enabled');
            set({ p2pool_enabled: !p2poolEnabled });
        });
    },
    setMoneroAddress: async (moneroAddress) => {
        const prevMoneroAddress = useAppConfigStore.getState().monero_address;
        set({ monero_address: moneroAddress });
        invoke('set_monero_address', { moneroAddress }).catch((e) => {
            const appStateStore = useAppStateStore.getState();
            console.error('Could not set Monero address', e);
            appStateStore.setError('Could not change Monero address');
            set({ monero_address: prevMoneroAddress });
        });
    },
    setMode: async (params) => {
        const { mode, customGpuLevels, customCpuLevels } = params;
        const prevMode = useAppConfigStore.getState().mode;
        set({ mode, custom_max_cpu_usage: customCpuLevels, custom_max_gpu_usage: customGpuLevels });
        console.info('Setting mode', mode, customCpuLevels, customGpuLevels);
        invoke('set_mode', {
            mode,
            customCpuUsage: customCpuLevels,
            customGpuUsage: customGpuLevels,
        }).catch((e) => {
            const appStateStore = useAppStateStore.getState();
            console.error('Could not set mode', e);
            appStateStore.setError('Could not change mode');
            set({ mode: prevMode });
        });
    },
    setUseTor: async (useTor) => {
        set({ use_tor: useTor });
        invoke('set_use_tor', { useTor }).catch((e) => {
            const appStateStore = useAppStateStore.getState();
            console.error('Could not set use Tor', e);
            appStateStore.setError('Could not change Tor usage');
            set({ use_tor: !useTor });
        });
    },
    setAutoUpdate: async (autoUpdate) => {
        set({ auto_update: autoUpdate });
        invoke('set_auto_update', { autoUpdate }).catch((e) => {
            const appStateStore = useAppStateStore.getState();
            console.error('Could not set auto update', e);
            appStateStore.setError('Could not change auto update');
            set({ auto_update: !autoUpdate });
        });
    },
    setMonerodConfig: async (useMoneroFail, moneroNodes) => {
        const prevMoneroNodes = useAppConfigStore.getState().mmproxy_monero_nodes;
        set({ mmproxy_use_monero_fail: useMoneroFail, mmproxy_monero_nodes: moneroNodes });
        invoke('set_monerod_config', { useMoneroFail, moneroNodes }).catch((e) => {
            const appStateStore = useAppStateStore.getState();
            console.error('Could not set monerod config', e);
            appStateStore.setError('Could not change monerod config');
            set({ mmproxy_use_monero_fail: !useMoneroFail, mmproxy_monero_nodes: prevMoneroNodes });
        });
    },
    setTheme: async (themeArg) => {
        const display_mode = themeArg?.toLowerCase() as displayMode;
        const prefersDarkMode = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
        const prevTheme = useAppConfigStore.getState().display_mode?.toLowerCase() as displayMode;
        const uiTheme = display_mode === 'system' ? (prefersDarkMode() ? 'dark' : 'light') : display_mode;

        setUITheme(uiTheme);

        set({ display_mode });

        const shouldUpdateConfigTheme = display_mode !== prevTheme;
        if (shouldUpdateConfigTheme) {
            invoke('set_display_mode', { displayMode: display_mode as displayMode }).catch((e) => {
                const appStateStore = useAppStateStore.getState();
                console.error('Could not set theme', e);
                appStateStore.setError('Could not change theme');
                set({ display_mode: prevTheme });
                if (prevTheme) setUITheme(prevTheme === 'system' ? (prefersDarkMode() ? 'dark' : 'light') : prevTheme);
            });
        }
    },
    setShowExperimentalSettings: async (showExperimentalSettings) => {
        set({ show_experimental_settings: showExperimentalSettings });
        invoke('set_show_experimental_settings', { showExperimentalSettings }).catch((e) => {
            const appStateStore = useAppStateStore.getState();
            console.error('Could not set show experimental settings', e);
            appStateStore.setError('Could not change experimental settings');
            set({ show_experimental_settings: !showExperimentalSettings });
        });
    },
    setP2poolStatsServerPort: async (port) => {
        set({ p2pool_stats_server_port: port });
        invoke('set_p2pool_stats_server_port', { port }).catch((e) => {
            const appStateStore = useAppStateStore.getState();
            console.error('Could not set p2pool stats server port', e);
            appStateStore.setError('Could not change p2pool stats server port');
            set({ p2pool_stats_server_port: port });
        });
    },
    setPreRelease: async (preRelease) => {
        set({ pre_release: preRelease });
        invoke('set_pre_release', { preRelease }).catch((e) => {
            const appStateStore = useAppStateStore.getState();
            console.error('Could not set pre release', e);
            appStateStore.setError('Could not change pre release');
            set({ pre_release: !preRelease });
        });
    },
}));

export const fetchAppConfig = async () => {
    try {
        const appConfig = await invoke('get_app_config');
        useAppConfigStore.setState(appConfig);
        const configTheme = appConfig.display_mode?.toLowerCase();
        const canvasElement = document.getElementById(TOWER_CANVAS_ID);
        if (configTheme) {
            await useAppConfigStore.getState().setTheme(configTheme as displayMode);
        }
        if (appConfig.visual_mode && !canvasElement) {
            try {
                await loadTowerAnimation({ canvasId: TOWER_CANVAS_ID, offset: sidebarTowerOffset });
            } catch (e) {
                console.error('Error at loadTowerAnimation:', e);
                useAppConfigStore.setState({ visual_mode: false });
            }
        }
    } catch (e) {
        console.error('Could not get app config: ', e);
    }
};

export const setVisualMode = (enabled: boolean) => {
    useAppConfigStore.setState({ visual_mode: enabled, visualModeToggleLoading: true });
    invoke('set_visual_mode', { enabled })
        .catch((e) => {
            const appStateStore = useAppStateStore.getState();
            console.error('Could not set visual mode', e);
            appStateStore.setError('Could not change visual mode');
            useAppConfigStore.setState({ visual_mode: !enabled });
        })
        .finally(() => {
            if (loadingTimeout) {
                clearTimeout(loadingTimeout);
            }
            loadingTimeout = setTimeout(() => {
                useAppConfigStore.setState({ visualModeToggleLoading: false });
            }, 3500);
        });
};
