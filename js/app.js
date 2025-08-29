/**
 * RefExtractor Main Application Entry Point
 * 负责整个应用程序的初始化、模块协调和生命周期管理
 * 
 * 功能特性：
 * - 模块依赖管理和加载顺序控制
 * - 全局错误处理和恢复机制
 * - 模块间通信协调
 * - 应用程序生命周期管理
 * - 性能监控和调试支持
 * 
 * @author RefExtractor Team
 * @version 2.0.0
 * @since 2024
 */

/**
 * 主应用程序类
 * 管理整个RefExtractor应用程序的生命周期
 */
class RefExtractorApp {
    constructor() {
        this.config = null;
        this.logger = null;
        this.errorHandler = null;
        this.modules = new Map();
        this.initializationOrder = [
            'RefExtractorConfig',
            'RefExtractorLogger',
            'RefExtractorErrorHandler',
            'RefExtractorDocumentParser',
            'RefExtractorFieldExtractor',
            'RefExtractorCitationProcessor',
            'RefExtractorZoteroIntegration',
            'RefExtractorOutputFormatter',
            'RefExtractorUIController'
        ];
        this.isInitialized = false;
        this.startTime = performance.now();
        
        // 绑定错误处理
        this.setupGlobalErrorHandling();
        
        console.log('RefExtractor App instance created');
    }

    /**
     * 设置全局错误处理
     * 捕获未处理的异常和Promise拒绝
     */
    setupGlobalErrorHandling() {
        // 捕获未处理的JavaScript错误
        window.addEventListener('error', (event) => {
            console.error('Global error caught:', event.error);
            if (this.errorHandler) {
                this.errorHandler.handleError(
                    'GLOBAL_ERROR',
                    'Unhandled JavaScript error',
                    { 
                        message: event.message,
                        filename: event.filename,
                        lineno: event.lineno,
                        colno: event.colno,
                        stack: event.error?.stack
                    }
                );
            }
        });

        // 捕获未处理的Promise拒绝
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            if (this.errorHandler) {
                this.errorHandler.handleError(
                    'PROMISE_REJECTION',
                    'Unhandled Promise rejection',
                    { reason: event.reason }
                );
            }
        });
    }

    /**
     * 初始化应用程序
     * 按正确的顺序加载和初始化所有模块
     * @returns {Promise<boolean>} 初始化是否成功
     */
    async init() {
        try {
            console.log('Starting RefExtractor application initialization...');
            
            // 检查浏览器支持
            if (!this.checkBrowserSupport()) {
                throw new Error('Browser not supported');
            }

            // 按顺序初始化模块
            await this.initializeModules();
            
            // 验证所有模块已正确加载
            this.validateModules();
            
            // 设置模块间通信
            this.setupInterModuleCommunication();
            
            // 初始化UI
            await this.initializeUI();
            
            this.isInitialized = true;
            const initTime = performance.now() - this.startTime;
            
            console.log(`RefExtractor initialized successfully in ${initTime.toFixed(2)}ms`);
            
            if (this.logger) {
                this.logger.info('Application initialized successfully', {
                    initTime: initTime,
                    modulesLoaded: this.modules.size
                });
            }

            // 触发初始化完成事件
            this.dispatchEvent('refextractor:initialized', {
                initTime: initTime,
                modules: Array.from(this.modules.keys())
            });

            return true;

        } catch (error) {
            console.error('Failed to initialize RefExtractor:', error);
            
            if (this.errorHandler) {
                this.errorHandler.handleError(
                    'INIT_FAILED',
                    'Application initialization failed',
                    { error: error.message, stack: error.stack }
                );
            }

            // 尝试恢复或显示错误信息
            this.handleInitializationFailure(error);
            return false;
        }
    }

    /**
     * 检查浏览器支持情况
     * @returns {boolean} 浏览器是否支持必要的功能
     */
    checkBrowserSupport() {
        const requiredFeatures = [
            'Promise',
            'FileReader',
            'Blob',
            'URL',
            'addEventListener'
        ];

        const missingFeatures = requiredFeatures.filter(feature => 
            !window[feature] && !window[feature.toLowerCase()]
        );

        if (missingFeatures.length > 0) {
            console.error('Missing browser features:', missingFeatures);
            return false;
        }

        // 检查ES6+支持
        try {
            new Function('const test = () => {}; const {a} = {}; return true;')();
        } catch (e) {
            console.error('ES6 features not supported');
            return false;
        }

        return true;
    }

    /**
     * 按顺序初始化所有模块
     * @returns {Promise<void>}
     */
    async initializeModules() {
        for (const moduleName of this.initializationOrder) {
            try {
                console.log(`Initializing module: ${moduleName}`);
                
                if (!window[moduleName]) {
                    throw new Error(`Module ${moduleName} not found`);
                }

                const moduleInstance = window[moduleName];
                
                // 如果模块有初始化方法，调用它
                if (typeof moduleInstance.init === 'function') {
                    await moduleInstance.init();
                }

                // 存储模块引用
                this.modules.set(moduleName, moduleInstance);
                
                // 设置核心模块的快捷引用
                this.setupCoreModuleReferences(moduleName, moduleInstance);
                
                console.log(`Module ${moduleName} initialized successfully`);

            } catch (error) {
                console.error(`Failed to initialize module ${moduleName}:`, error);
                throw new Error(`Module initialization failed: ${moduleName} - ${error.message}`);
            }
        }
    }

    /**
     * 设置核心模块的快捷引用
     * @param {string} moduleName 模块名称
     * @param {object} moduleInstance 模块实例
     */
    setupCoreModuleReferences(moduleName, moduleInstance) {
        switch (moduleName) {
            case 'RefExtractorConfig':
                this.config = moduleInstance;
                break;
            case 'RefExtractorLogger':
                this.logger = moduleInstance;
                break;
            case 'RefExtractorErrorHandler':
                this.errorHandler = moduleInstance;
                break;
        }
    }

    /**
     * 验证所有模块是否正确加载
     * @throws {Error} 如果有模块未正确加载
     */
    validateModules() {
        const missingModules = this.initializationOrder.filter(
            moduleName => !this.modules.has(moduleName)
        );

        if (missingModules.length > 0) {
            throw new Error(`Missing modules: ${missingModules.join(', ')}`);
        }

        // 验证核心模块的关键方法
        this.validateCoreModuleMethods();
    }

    /**
     * 验证核心模块的关键方法
     * @throws {Error} 如果核心方法缺失
     */
    validateCoreModuleMethods() {
        const validations = [
            { module: this.config, methods: ['get', 'APP', 'ERROR_CODES'] },
            { module: this.logger, methods: ['info', 'error', 'warn', 'debug'] },
            { module: this.errorHandler, methods: ['handleError', 'createStandardError'] }
        ];

        validations.forEach(({ module, methods }) => {
            if (!module) return;
            
            const missingMethods = methods.filter(method => 
                typeof module[method] === 'undefined'
            );

            if (missingMethods.length > 0) {
                throw new Error(`Core module missing methods: ${missingMethods.join(', ')}`);
            }
        });
    }

    /**
     * 设置模块间通信
     * 建立模块之间的事件监听和数据流
     */
    setupInterModuleCommunication() {
        // 设置全局事件监听器
        window.addEventListener('refextractor:error', (event) => {
            if (this.errorHandler) {
                this.errorHandler.handleError(
                    event.detail.code || 'UNKNOWN_ERROR',
                    event.detail.message || 'Unknown error occurred',
                    event.detail.data || {}
                );
            }
        });

        window.addEventListener('refextractor:log', (event) => {
            if (this.logger) {
                const { level, message, data } = event.detail;
                this.logger[level.toLowerCase()](message, data);
            }
        });

        // 设置模块依赖注入
        this.injectDependencies();
    }

    /**
     * 注入模块依赖
     * 为各模块提供所需的依赖引用
     */
    injectDependencies() {
        const dependencyMap = {
            'RefExtractorDocumentParser': {
                config: this.config,
                logger: this.logger,
                errorHandler: this.errorHandler
            },
            'RefExtractorFieldExtractor': {
                config: this.config,
                logger: this.logger,
                errorHandler: this.errorHandler
            },
            'RefExtractorCitationProcessor': {
                config: this.config,
                logger: this.logger,
                errorHandler: this.errorHandler
            },
            'RefExtractorZoteroIntegration': {
                config: this.config,
                logger: this.logger,
                errorHandler: this.errorHandler
            },
            'RefExtractorOutputFormatter': {
                config: this.config,
                logger: this.logger,
                errorHandler: this.errorHandler
            },
            'RefExtractorUIController': {
                config: this.config,
                logger: this.logger,
                errorHandler: this.errorHandler,
                documentParser: this.modules.get('RefExtractorDocumentParser'),
                fieldExtractor: this.modules.get('RefExtractorFieldExtractor'),
                citationProcessor: this.modules.get('RefExtractorCitationProcessor'),
                zoteroIntegration: this.modules.get('RefExtractorZoteroIntegration'),
                outputFormatter: this.modules.get('RefExtractorOutputFormatter')
            }
        };

        // 注入依赖
        Object.entries(dependencyMap).forEach(([moduleName, dependencies]) => {
            const module = this.modules.get(moduleName);
            if (module && typeof module.setDependencies === 'function') {
                module.setDependencies(dependencies);
            }
        });
    }

    /**
     * 初始化用户界面
     * @returns {Promise<void>}
     */
    async initializeUI() {
        const uiController = this.modules.get('RefExtractorUIController');
        
        if (!uiController) {
            throw new Error('UI Controller module not found');
        }

        // 等待DOM完全加载
        if (document.readyState !== 'complete') {
            await new Promise(resolve => {
                window.addEventListener('load', resolve);
            });
        }

        // 初始化UI控制器
        if (typeof uiController.init === 'function') {
            await uiController.init();
        }

        console.log('UI initialized successfully');
    }

    /**
     * 处理初始化失败
     * @param {Error} error 初始化错误
     */
    handleInitializationFailure(error) {
        // 显示用户友好的错误信息
        const errorContainer = document.getElementById('error-container') || 
                              document.body;

        const errorHTML = `
            <div class="alert alert-danger" role="alert">
                <h4 class="alert-heading">Application Initialization Failed</h4>
                <p>RefExtractor failed to start properly. This may be due to:</p>
                <ul>
                    <li>Browser compatibility issues</li>
                    <li>Missing JavaScript files</li>
                    <li>Network connectivity problems</li>
                </ul>
                <hr>
                <p class="mb-0">
                    <strong>Error details:</strong> ${error.message}
                </p>
                <button class="btn btn-primary mt-2" onclick="location.reload()">
                    Retry
                </button>
            </div>
        `;

        if (errorContainer === document.body) {
            errorContainer.innerHTML = errorHTML;
        } else {
            errorContainer.innerHTML = errorHTML;
        }
    }

    /**
     * 获取模块实例
     * @param {string} moduleName 模块名称
     * @returns {object|null} 模块实例
     */
    getModule(moduleName) {
        return this.modules.get(moduleName) || null;
    }

    /**
     * 检查应用程序是否已初始化
     * @returns {boolean}
     */
    isReady() {
        return this.isInitialized;
    }

    /**
     * 获取应用程序状态信息
     * @returns {object} 状态信息
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            modulesLoaded: this.modules.size,
            expectedModules: this.initializationOrder.length,
            uptime: performance.now() - this.startTime,
            modules: Array.from(this.modules.keys())
        };
    }

    /**
     * 重启应用程序
     * @returns {Promise<boolean>}
     */
    async restart() {
        console.log('Restarting RefExtractor application...');
        
        try {
            // 清理现有状态
            this.cleanup();
            
            // 重新初始化
            return await this.init();
            
        } catch (error) {
            console.error('Failed to restart application:', error);
            return false;
        }
    }

    /**
     * 清理应用程序状态
     */
    cleanup() {
        this.isInitialized = false;
        this.modules.clear();
        this.config = null;
        this.logger = null;
        this.errorHandler = null;
        
        // 触发清理事件
        this.dispatchEvent('refextractor:cleanup');
    }

    /**
     * 派发自定义事件
     * @param {string} eventName 事件名称
     * @param {object} detail 事件详情
     */
    dispatchEvent(eventName, detail = {}) {
        const event = new CustomEvent(eventName, { detail });
        window.dispatchEvent(event);
    }

    /**
     * 导出诊断信息
     * @returns {object} 诊断信息
     */
    exportDiagnostics() {
        return {
            timestamp: new Date().toISOString(),
            status: this.getStatus(),
            config: this.config ? {
                version: this.config.APP?.VERSION,
                environment: this.config.APP?.ENVIRONMENT
            } : null,
            browser: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language,
                onLine: navigator.onLine
            },
            performance: {
                memory: performance.memory ? {
                    used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                    total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                    limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
                } : null,
                timing: performance.timing ? {
                    navigationStart: performance.timing.navigationStart,
                    loadEventEnd: performance.timing.loadEventEnd,
                    domContentLoadedEventEnd: performance.timing.domContentLoadedEventEnd
                } : null
            },
            errors: this.errorHandler ? this.errorHandler.getErrorSummary() : null
        };
    }
}

// 创建全局应用程序实例
window.RefExtractorApp = RefExtractorApp;

/**
 * 应用程序入口点
 * 当DOM加载完成后自动初始化应用程序
 */
document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM loaded, initializing RefExtractor...');
    
    try {
        // 创建应用程序实例
        const app = new RefExtractorApp();
        
        // 将应用程序实例添加到全局作用域以便调试
        window.refExtractorApp = app;
        
        // 初始化应用程序
        const success = await app.init();
        
        if (success) {
            console.log('RefExtractor application started successfully');
            
            // 显示成功消息（可选）
            const successEvent = new CustomEvent('refextractor:ready', {
                detail: { app: app }
            });
            window.dispatchEvent(successEvent);
            
        } else {
            console.error('RefExtractor application failed to start');
        }

    } catch (error) {
        console.error('Critical error during application startup:', error);
        
        // 创建错误报告
        const errorReport = {
            timestamp: new Date().toISOString(),
            error: {
                message: error.message,
                stack: error.stack
            },
            browser: navigator.userAgent,
            url: window.location.href
        };
        
        // 存储错误报告到本地存储（如果可用）
        try {
            localStorage.setItem('refextractor-startup-error', JSON.stringify(errorReport));
        } catch (e) {
            console.warn('Could not save error report to localStorage');
        }
    }
});

// 导出模块（如果在模块环境中）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RefExtractorApp };
}

/**
 * 开发者工具和调试辅助函数
 * 仅在开发环境中可用
 */
if (typeof window !== 'undefined') {
    // 添加调试辅助函数到全局作用域
    window.RefExtractorDebug = {
        /**
         * 获取应用程序状态
         */
        getAppStatus() {
            return window.refExtractorApp ? window.refExtractorApp.getStatus() : null;
        },
        
        /**
         * 重启应用程序
         */
        async restartApp() {
            if (window.refExtractorApp) {
                return await window.refExtractorApp.restart();
            }
            return false;
        },
        
        /**
         * 导出诊断信息
         */
        exportDiagnostics() {
            return window.refExtractorApp ? window.refExtractorApp.exportDiagnostics() : null;
        },
        
        /**
         * 获取模块实例
         */
        getModule(name) {
            return window.refExtractorApp ? window.refExtractorApp.getModule(name) : null;
        },
        
        /**
         * 列出所有可用模块
         */
        listModules() {
            if (!window.refExtractorApp) return [];
            return Array.from(window.refExtractorApp.modules.keys());
        }
    };
}

console.log('RefExtractor App module loaded successfully');
