/**
 * @fileoverview UI控制器模块 - 管理用户界面交互、事件处理和页面状态更新
 * @version 1.0.0
 * @author Reference Extractor Team
 */

/**
 * RefExtractor UI控制器
 * 负责用户界面的交互逻辑、状态管理和事件处理
 */
window.RefExtractorUIController = (function() {
    'use strict';

    // 私有变量
    let isInitialized = false;
    let currentState = 'initial';
    let uiElements = {};
    let eventListeners = new Map();
    let clipboardInstance = null;

    /**
     * 获取配置的辅助函数
     * @param {string} path - 配置路径
     * @param {*} defaultValue - 默认值
     * @returns {*} 配置值
     */
    function getConfig(path, defaultValue) {
        if (window.RefExtractorConfig && window.RefExtractorConfig.get) {
            return window.RefExtractorConfig.get(path, defaultValue);
        }
        return defaultValue;
    }

    /**
     * 获取日志器实例
     * @returns {object} 日志器对象
     */
    function getLogger() {
        return window.RefExtractorLogger || {
            error: console.error.bind(console),
            warn: console.warn.bind(console),
            info: console.info.bind(console),
            debug: console.log.bind(console)
        };
    }

    /**
     * 获取错误处理器实例
     * @returns {object} 错误处理器对象
     */
    function getErrorHandler() {
        return window.RefExtractorErrorHandler || {
            handleError: (code, message, error, context) => {
                console.error(`Error ${code}: ${message}`, error, context);
                return { code, message, error, context };
            }
        };
    }

    /**
     * 初始化UI元素引用
     */
    function initializeUIElements() {
        const logger = getLogger();
        logger.debug('Initializing UI elements');

        const elementIds = getConfig('UI_ELEMENTS', {});
        const missingElements = [];

        // 获取所有UI元素
        for (const [key, elementId] of Object.entries(elementIds)) {
            const element = document.getElementById(elementId);
            if (element) {
                uiElements[key] = element;
                logger.debug(`Found UI element: ${key} (${elementId})`);
            } else {
                missingElements.push(elementId);
                logger.warn(`Missing UI element: ${key} (${elementId})`);
            }
        }

        if (missingElements.length > 0) {
            logger.warn('Some UI elements are missing', { missingElements });
        }

        logger.info('UI elements initialization completed', {
            total: Object.keys(elementIds).length,
            found: Object.keys(uiElements).length,
            missing: missingElements.length
        });
    }

    /**
     * 设置元素状态
     * @param {string} elementKey - 元素键名
     * @param {object} properties - 要设置的属性
     */
    function setElementState(elementKey, properties) {
        const element = uiElements[elementKey];
        if (!element) {
            getLogger().warn(`UI element not found: ${elementKey}`);
            return;
        }

        try {
            for (const [property, value] of Object.entries(properties)) {
                switch (property) {
                    case 'disabled':
                        if (value) {
                            element.setAttribute('disabled', 'true');
                        } else {
                            element.removeAttribute('disabled');
                        }
                        break;
                    case 'value':
                        if (element.value !== undefined) {
                            element.value = value;
                        } else {
                            element.setAttribute('value', value);
                        }
                        break;
                    case 'textContent':
                        element.textContent = value;
                        break;
                    case 'innerHTML':
                        element.innerHTML = value;
                        break;
                    case 'className':
                        element.className = value;
                        break;
                    case 'rows':
                        element.setAttribute('rows', value);
                        break;
                    default:
                        element.setAttribute(property, value);
                }
            }
        } catch (error) {
            getLogger().error(`Failed to set element state for ${elementKey}`, error);
        }
    }

    /**
     * 重置页面到初始状态
     */
    function resetToInitialState() {
        const logger = getLogger();
        logger.debug('Resetting page to initial state');

        try {
            // 重置计数器和样式信息
            setElementState('EXTRACT_COUNT', { value: '0' });
            setElementState('SELECTED_STYLE', { value: '-' });

            // 禁用控制按钮
            setElementState('DOWNLOAD_BTN', { disabled: true });
            setElementState('COPY_BTN', { 
                disabled: true,
                'data-clipboard-text': ''
            });
            setElementState('ZOTERO_BTN', { disabled: true });

            // 重置文本区域
            setElementState('TEXT_AREA', { 
                rows: '3',
                value: ''
            });

            // 清空Zotero选择列表
            if (uiElements['ZOTERO_LIST']) {
                uiElements['ZOTERO_LIST'].innerHTML = '';
            }

            currentState = 'initial';
            logger.debug('Page reset completed');

        } catch (error) {
            getLogger().error('Failed to reset page state', error);
        }
    }

    /**
     * 更新处理结果显示
     * @param {object} result - 处理结果
     */
    function updateProcessingResults(result) {
        const logger = getLogger();
        logger.debug('Updating processing results', { 
            citationCount: result.citations?.length || 0 
        });

        try {
            const citations = result.citations || [];
            const stats = result.statistics || {};

            // 更新引用计数显示
            let countText = citations.length.toString();
            if (stats.duplicatesRemoved > 0) {
                countText += ` (${stats.duplicatesRemoved} duplicates removed)`;
            }
            if (stats.citesWithoutMetadata > 0) {
                countText += ` (${stats.citesWithoutMetadata} items without metadata)`;
            }

            setElementState('EXTRACT_COUNT', { value: countText });

            if (citations.length > 0) {
                // 启用控制按钮
                setElementState('DOWNLOAD_BTN', { disabled: false });
                setElementState('COPY_BTN', { disabled: false });

                // 扩展文本区域并显示内容
                setElementState('TEXT_AREA', { 
                    rows: '15',
                    value: window.RefExtractorOutputFormatter ? 
                        window.RefExtractorOutputFormatter.format(getConfig('OUTPUT_FORMATS.CSL_JSON')) :
                        JSON.stringify(citations, null, 2)
                });

                currentState = 'results-available';
            } else {
                currentState = 'no-results';
            }

            logger.debug('Processing results updated successfully');

        } catch (error) {
            getLogger().error('Failed to update processing results', error);
        }
    }

    /**
     * 更新样式信息显示
     * @param {object} styleInfo - 样式信息
     */
    function updateStyleInfo(styleInfo) {
        const logger = getLogger();
        logger.debug('Updating style information');

        try {
            const styleText = styleInfo?.cleaned || styleInfo?.combined || '-';
            setElementState('SELECTED_STYLE', { value: styleText });
            
            logger.debug('Style information updated', { styleText });
        } catch (error) {
            getLogger().error('Failed to update style information', error);
        }
    }

    /**
     * 更新Zotero选择选项
     * @param {object} zoteroData - Zotero数据
     */
    function updateZoteroSelectors(zoteroData) {
        const logger = getLogger();
        logger.debug('Updating Zotero selectors');

        try {
            const zoteroList = uiElements['ZOTERO_LIST'];
            if (!zoteroList) {
                logger.warn('Zotero list element not found');
                return;
            }

            // 清空现有列表
            zoteroList.innerHTML = '';

            if (!zoteroData?.hasZoteroItems || !zoteroData.selectors) {
                logger.debug('No Zotero items to display');
                return;
            }

            // 获取UI友好的选择器信息
            const selectors = window.RefExtractorZoteroIntegration?.getSelectorsForUI() || [];

            if (selectors.length === 0) {
                logger.debug('No valid Zotero selectors found');
                return;
            }

            // 添加选择器到列表
            selectors.forEach(selector => {
                const listItem = document.createElement('li');
                const link = document.createElement('a');
                link.href = selector.url;
                link.textContent = selector.text;
                listItem.appendChild(link);
                zoteroList.appendChild(listItem);
            });

            // 启用Zotero按钮
            setElementState('ZOTERO_BTN', { disabled: false });

            logger.info('Zotero selectors updated', { selectorCount: selectors.length });

        } catch (error) {
            getLogger().error('Failed to update Zotero selectors', error);
        }
    }

    /**
     * 处理文件选择事件
     * @param {Event} event - 文件选择事件
     */
    async function handleFileSelect(event) {
        const logger = getLogger();
        const errorHandler = getErrorHandler();

        logger.info('File selection started');

        try {
            const file = event.target.files[0];
            if (!file) {
                logger.debug('No file selected');
                return;
            }

            logger.info('Processing selected file', {
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type
            });

            // 重置页面状态
            resetToInitialState();
            currentState = 'processing';

            // 检查文件类型
            if (window.RefExtractorDocumentParser && 
                !window.RefExtractorDocumentParser.isDocumentTypeSupported(file)) {
                throw new Error('Unsupported file type. Please select a .docx or .odt file.');
            }

            // 解析文档
            const documentParser = window.RefExtractorDocumentParser;
            if (!documentParser) {
                throw new Error('Document parser not available');
            }

            const document = await documentParser.parse(file);
            logger.info('Document parsed successfully', { 
                type: document.type,
                contentFilesCount: document.contentFiles.length 
            });

            // 提取字段
            const fieldExtractor = window.RefExtractorFieldExtractor;
            if (!fieldExtractor) {
                throw new Error('Field extractor not available');
            }

            const fields = fieldExtractor.extractFields(document.contentFiles, document.type);
            logger.info('Fields extracted', { fieldCount: fields.length });

            // 提取样式信息
            const styleInfo = fieldExtractor.extractStyleInfo(document.styleContent, document.type);
            updateStyleInfo(styleInfo);

            // 处理引用
            const citationProcessor = window.RefExtractorCitationProcessor;
            if (!citationProcessor) {
                throw new Error('Citation processor not available');
            }

            const citationResult = citationProcessor.processFields(fields);
            logger.info('Citations processed', { 
                citationCount: citationResult.citations.length 
            });

            // 更新显示
            updateProcessingResults(citationResult);

            // 设置输出格式化器的引用数据
            if (window.RefExtractorOutputFormatter) {
                window.RefExtractorOutputFormatter.setCitations(citationResult.citations);
            }

            // 处理Zotero集成
            if (window.RefExtractorZoteroIntegration) {
                try {
                    const zoteroResult = window.RefExtractorZoteroIntegration.processZoteroIntegration(
                        citationResult.deduplicatedCitations || citationResult.citations
                    );
                    updateZoteroSelectors(zoteroResult);
                } catch (zoteroError) {
                    logger.warn('Zotero integration failed', zoteroError);
                }
            }

            currentState = 'completed';
            logger.info('File processing completed successfully');

        } catch (error) {
            currentState = 'error';
            
            const handledError = errorHandler.handleError(
                getConfig('ERROR_CODES.FILE_READ_ERROR', 1001),
                'File processing failed',
                error,
                { fileName: event.target.files[0]?.name }
            );

            // 显示错误消息
            setElementState('EXTRACT_COUNT', { 
                value: `Error: ${handledError.userMessage || handledError.message}` 
            });

            logger.error('File processing failed', handledError);
        }
    }

    /**
     * 处理格式选择事件
     * @param {Event} event - 格式选择事件
     */
    function handleFormatSelect(event) {
        const logger = getLogger();
        logger.debug('Format selection changed', { format: event.target.value });

        try {
            if (currentState !== 'results-available' && currentState !== 'completed') {
                logger.debug('No results available for formatting');
                return;
            }

            const outputFormatter = window.RefExtractorOutputFormatter;
            if (!outputFormatter) {
                logger.warn('Output formatter not available');
                return;
            }

            const selectedFormat = event.target.value;
            const formattedOutput = outputFormatter.format(selectedFormat);
            
            setElementState('TEXT_AREA', { value: formattedOutput });
            
            logger.debug('Output format updated', { 
                format: selectedFormat,
                outputLength: formattedOutput.length 
            });

        } catch (error) {
            getLogger().error('Failed to handle format selection', error);
        }
    }

    /**
     * 处理下载按钮点击
     */
    function handleDownload() {
        const logger = getLogger();
        logger.debug('Download button clicked');

        try {
            const outputFormatter = window.RefExtractorOutputFormatter;
            if (!outputFormatter) {
                throw new Error('Output formatter not available');
            }

            const formatSelect = uiElements['OUTPUT_FORMAT'];
            if (!formatSelect) {
                throw new Error('Format selection element not found');
            }

            const selectedFormat = formatSelect.value;
            const output = outputFormatter.format(selectedFormat);
            const extension = outputFormatter.getFileExtension(selectedFormat);

            // 创建并下载文件
            const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
            
            if (typeof saveAs === 'function') {
                saveAs(blob, `ref-extracts${extension}`);
                logger.info('File download initiated', { format: selectedFormat, extension });
            } else {
                throw new Error('FileSaver.js not available');
            }

        } catch (error) {
            getLogger().error('Download failed', error);
            showUserMessage('Download failed. Please try again.', 'error');
        }
    }

    /**
     * 显示用户消息
     * @param {string} message - 消息内容
     * @param {string} type - 消息类型 ('info', 'error', 'warning')
     */
    function showUserMessage(message, type = 'info') {
        const logger = getLogger();
        
        // 简单的消息显示实现
        // 在实际应用中，可以使用更复杂的通知系统
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        if (type === 'error') {
            alert(`Error: ${message}`);
        }

        logger.debug('User message displayed', { message, type });
    }

    /**
     * 绑定事件监听器
     */
    function bindEventListeners() {
        const logger = getLogger();
        logger.debug('Binding event listeners');

        try {
            // 文件选择事件
            if (uiElements['FILE_UPLOAD']) {
                const fileHandler = handleFileSelect.bind(this);
                uiElements['FILE_UPLOAD'].addEventListener('change', fileHandler);
                eventListeners.set('FILE_UPLOAD', { element: uiElements['FILE_UPLOAD'], event: 'change', handler: fileHandler });
            }

            // 格式选择事件
            if (uiElements['OUTPUT_FORMAT']) {
                const formatHandler = handleFormatSelect.bind(this);
                uiElements['OUTPUT_FORMAT'].addEventListener('change', formatHandler);
                eventListeners.set('OUTPUT_FORMAT', { element: uiElements['OUTPUT_FORMAT'], event: 'change', handler: formatHandler });
            }

            // 下载按钮事件
            if (uiElements['DOWNLOAD_BTN']) {
                const downloadHandler = handleDownload.bind(this);
                uiElements['DOWNLOAD_BTN'].addEventListener('click', downloadHandler);
                eventListeners.set('DOWNLOAD_BTN', { element: uiElements['DOWNLOAD_BTN'], event: 'click', handler: downloadHandler });
            }

            // 初始化剪贴板功能
            if (typeof ClipboardJS === 'function' && uiElements['COPY_BTN']) {
                clipboardInstance = new ClipboardJS(uiElements['COPY_BTN'], {
                    text: function() {
                        const outputFormatter = window.RefExtractorOutputFormatter;
                        if (outputFormatter && uiElements['OUTPUT_FORMAT']) {
                            return outputFormatter.format(uiElements['OUTPUT_FORMAT'].value);
                        }
                        return uiElements['TEXT_AREA']?.value || '';
                    }
                });

                clipboardInstance.on('success', function(e) {
                    const copyButton = uiElements['COPY_BTN'];
                    const originalText = copyButton.innerHTML;
                    copyButton.innerHTML = 'Copied!';
                    
                    setTimeout(() => {
                        copyButton.innerHTML = originalText;
                    }, 2000);
                    
                    logger.debug('Content copied to clipboard');
                });

                clipboardInstance.on('error', function(e) {
                    logger.error('Failed to copy to clipboard', e);
                    showUserMessage('Failed to copy to clipboard', 'error');
                });
            }

            logger.info('Event listeners bound successfully');

        } catch (error) {
            getLogger().error('Failed to bind event listeners', error);
        }
    }

    /**
     * 解绑事件监听器
     */
    function unbindEventListeners() {
        const logger = getLogger();
        logger.debug('Unbinding event listeners');

        eventListeners.forEach((listener, key) => {
            try {
                listener.element.removeEventListener(listener.event, listener.handler);
                logger.debug(`Unbound event listener: ${key}`);
            } catch (error) {
                logger.warn(`Failed to unbind event listener: ${key}`, error);
            }
        });

        eventListeners.clear();

        // 清理剪贴板实例
        if (clipboardInstance) {
            clipboardInstance.destroy();
            clipboardInstance = null;
        }

        logger.debug('Event listeners unbound');
    }

    // 公共API
    const UIController = {
        /**
         * 初始化UI控制器
         */
        init() {
            if (isInitialized) {
                getLogger().debug('UI Controller already initialized');
                return;
            }

            const logger = getLogger();
            logger.info('Initializing UI Controller');

            try {
                initializeUIElements();
                bindEventListeners();
                resetToInitialState();
                
                isInitialized = true;
                logger.info('UI Controller initialized successfully');

            } catch (error) {
                getLogger().error('UI Controller initialization failed', error);
                throw error;
            }
        },

        /**
         * 销毁UI控制器
         */
        destroy() {
            if (!isInitialized) {
                return;
            }

            const logger = getLogger();
            logger.info('Destroying UI Controller');

            unbindEventListeners();
            uiElements = {};
            currentState = 'initial';
            isInitialized = false;

            logger.info('UI Controller destroyed');
        },

        /**
         * 重置到初始状态
         */
        resetToInitialState() {
            resetToInitialState();
        },

        /**
         * 重新绑定事件监听器
         */
        rebindEvents() {
            const logger = getLogger();
            logger.info('Rebinding UI event listeners');

            unbindEventListeners();
            bindEventListeners();

            logger.info('UI event listeners rebound');
        },

        /**
         * 显示错误消息
         * @param {string} message - 错误消息
         * @param {string} severity - 严重程度
         */
        showError(message, severity = 'error') {
            showUserMessage(message, severity);
        },

        /**
         * 获取当前状态
         * @returns {string} 当前状态
         */
        getCurrentState() {
            return currentState;
        },

        /**
         * 获取UI元素
         * @param {string} key - 元素键名
         * @returns {Element|null} UI元素
         */
        getElement(key) {
            return uiElements[key] || null;
        },

        /**
         * 检查是否已初始化
         * @returns {boolean} 是否已初始化
         */
        isInitialized() {
            return isInitialized;
        },

        /**
         * 获取UI状态信息
         * @returns {object} 状态信息
         */
        getStateInfo() {
            return {
                isInitialized,
                currentState,
                elementCount: Object.keys(uiElements).length,
                listenerCount: eventListeners.size,
                hasClipboard: !!clipboardInstance
            };
        }
    };

    return UIController;
})();

// 自动初始化
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', function() {
        try {
            window.RefExtractorUIController.init();
        } catch (error) {
            console.error('Failed to initialize UI Controller:', error);
        }
    });
}

// 导出模块（兼容不同模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.RefExtractorUIController;
}
