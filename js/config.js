/**
 * @fileoverview 全局配置模块 - 管理应用程序的全局配置、常量定义和环境变量
 * @version 1.0.0
 * @author Reference Extractor Team
 */

/**
 * RefExtractor全局配置对象
 * 统一管理应用程序的配置信息、常量和错误代码
 */
window.RefExtractorConfig = {
    /**
     * 应用程序基本信息
     */
    APP: {
        NAME: 'Reference Extractor',
        VERSION: '1.0.0',
        DESCRIPTION: 'Extract Zotero and Mendeley references from Word and LibreOffice documents'
    },

    /**
     * 支持的文档类型配置
     */
    DOCUMENT_TYPES: {
        OFFICE_OPEN_XML: 'OfficeOpenXML',
        OPEN_DOCUMENT: 'OpenDocument'
    },

    /**
     * 文件路径配置 - 定义文档解析时需要提取的文件路径
     */
    FILE_PATHS: {
        // OfficeOpenXML (.docx) 文件路径
        OFFICE_OPEN_XML: {
            CONTENT_FILES: ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml'],
            STYLE_FILE: 'docProps/custom.xml',
            INDICATOR_FILE: 'word/document.xml'
        },
        // OpenDocument (.odt) 文件路径
        OPEN_DOCUMENT: {
            CONTENT_FILES: ['content.xml'],
            STYLE_FILE: 'meta.xml',
            INDICATOR_FILE: 'content.xml'
        }
    },

    /**
     * 引用字段前缀配置 - 用于识别不同引用管理器的字段
     */
    CITATION_PREFIXES: {
        // Mendeley引用字段前缀
        MENDELEY: /^ADDIN CSL_CITATION/,
        // Zotero在Word中的引用字段前缀
        ZOTERO_WORD: /^ADDIN ZOTERO_ITEM CSL_CITATION/,
        // Zotero在ODT中的引用字段前缀
        ZOTERO_ODT: /^ZOTERO_ITEM CSL_CITATION/,
        // 通用CSL引用字段前缀
        CSL_GENERAL: /^(ADDIN )?(ZOTERO_ITEM )?CSL_CITATION/
    },

    /**
     * XML选择器配置 - 用于从XML文档中提取特定元素
     */
    XML_SELECTORS: {
        // OfficeOpenXML字段选择器
        OFFICE_OPEN_XML: {
            FIELD_CHAR_BEGIN: "*|fldChar[*|fldCharType=begin]",
            FIELD_CHAR_END: "*|fldChar[*|fldCharType=end]",
            INSTR_TEXT: "w:instrText"
        },
        // OpenDocument字段选择器
        OPEN_DOCUMENT: {
            REFERENCE_MARKS: "*|reference-mark-start[*|name]"
        },
        // CSL样式选择器
        STYLE_SELECTORS: {
            MENDELEY: "property[name='Mendeley Recent Style Id 0_1']",
            ZOTERO_OFFICE: "property[name^=ZOTERO_PREF]>*",
            ZOTERO_ODT: "*|user-defined[*|name^=ZOTERO_PREF]"
        }
    },

    /**
     * 输出格式配置
     */
    OUTPUT_FORMATS: {
        CSL_JSON: 'data',
        CSL_JSON_WITH_COUNTS: 'data-with-counts',
        BIBTEX: 'bibtex',
        RIS: 'ris',
        BIBLIOGRAPHY: 'bibliography',
        BIBLIOGRAPHY_WITH_COUNTS: 'bibliography-with-counts'
    },

    /**
     * 文件扩展名映射
     */
    FILE_EXTENSIONS: {
        'data': '.json',
        'data-with-counts': '.json',
        'bibtex': '.bib',
        'ris': '.ris',
        'bibliography': '.txt',
        'bibliography-with-counts': '.tsv'
    },

    /**
     * Zotero集成配置
     */
    ZOTERO: {
        URI_PREFIX: 'http://zotero.org/',
        LOCAL_URI_PREFIX: 'http://zotero.org/users/local/',
        WEB_URI_PREFIX: 'http://zotero.org/users/',
        SELECTION_PREFIX: 'zotero://select/',
        LIBRARY_TYPES: {
            USERS: 'users',
            GROUPS: 'groups'
        }
    },

    /**
     * UI元素ID配置
     */
    UI_ELEMENTS: {
        FILE_UPLOAD: 'file_upload',
        OUTPUT_FORMAT: 'output_format',
        EXTRACT_COUNT: 'extract_count',
        SELECTED_STYLE: 'selected_style',
        DOWNLOAD_BTN: 'download',
        COPY_BTN: 'copy_to_clipboard',
        ZOTERO_BTN: 'zotero_item_selection_button',
        ZOTERO_LIST: 'zotero_item_selection_link_list',
        TEXT_AREA: 'textArea'
    },

    /**
     * 错误代码定义
     */
    ERROR_CODES: {
        // 文件处理错误 (1000-1999)
        FILE_READ_ERROR: 1001,
        FILE_PARSE_ERROR: 1002,
        INVALID_FILE_TYPE: 1003,
        CORRUPTED_ZIP: 1004,

        // XML处理错误 (2000-2999)
        XML_PARSE_ERROR: 2001,
        INVALID_XML_STRUCTURE: 2002,
        MISSING_XML_ELEMENTS: 2003,

        // 引用处理错误 (3000-3999)
        CITATION_PARSE_ERROR: 3001,
        INVALID_JSON_FORMAT: 3002,
        DEDUPLICATION_ERROR: 3003,

        // UI错误 (4000-4999)
        ELEMENT_NOT_FOUND: 4001,
        EVENT_BINDING_ERROR: 4002,

        // 网络/外部依赖错误 (5000-5999)
        CITATION_JS_ERROR: 5001,
        CLIPBOARD_ERROR: 5002,

        // 未知错误 (9000-9999)
        UNKNOWN_ERROR: 9999
    },

    /**
     * 日志级别配置
     */
    LOG_LEVELS: {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3
    },

    /**
     * 性能监控配置
     */
    PERFORMANCE: {
        ENABLE_TIMING: true,
        ENABLE_MEMORY_TRACKING: true,
        MAX_LOG_ENTRIES: 1000
    },

    /**
     * 调试配置
     */
    DEBUG: {
        ENABLED: true,
        VERBOSE_LOGGING: false,
        CONSOLE_OUTPUT: true,
        STORE_ERRORS: true,
        MAX_ERROR_HISTORY: 50
    },

    /**
     * 字符串资源 - 多语言支持预留
     */
    MESSAGES: {
        ERRORS: {
            FILE_READ_FAILED: '读取文件失败',
            INVALID_DOCUMENT_TYPE: '不支持的文档类型',
            NO_REFERENCES_FOUND: '未找到引用',
            PARSING_FAILED: '解析失败',
            NETWORK_ERROR: '网络错误',
            UNKNOWN_ERROR: '未知错误'
        },
        SUCCESS: {
            FILE_PROCESSED: '文件处理成功',
            REFERENCES_EXTRACTED: '引用提取完成',
            OUTPUT_GENERATED: '输出生成成功'
        },
        INFO: {
            PROCESSING_FILE: '正在处理文件...',
            EXTRACTING_FIELDS: '正在提取字段...',
            DEDUPLICATING: '正在去重...',
            FORMATTING_OUTPUT: '正在格式化输出...'
        }
    }
};

/**
 * 获取配置值的辅助函数
 * @param {string} path - 配置路径，使用点号分隔，如 'APP.NAME'
 * @param {*} defaultValue - 默认值
 * @returns {*} 配置值或默认值
 */
window.RefExtractorConfig.get = function(path, defaultValue = null) {
    try {
        const keys = path.split('.');
        let value = this;
        
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }
        
        return value;
    } catch (error) {
        console.warn(`Failed to get config value for path: ${path}`, error);
        return defaultValue;
    }
};

/**
 * 验证配置完整性
 * @returns {boolean} 是否配置有效
 */
window.RefExtractorConfig.validate = function() {
    try {
        // 检查必需的配置是否存在
        const requiredPaths = [
            'APP.NAME',
            'DOCUMENT_TYPES.OFFICE_OPEN_XML',
            'FILE_PATHS.OFFICE_OPEN_XML.CONTENT_FILES',
            'CITATION_PREFIXES.CSL_GENERAL',
            'OUTPUT_FORMATS.CSL_JSON'
        ];

        for (const path of requiredPaths) {
            if (this.get(path) === null) {
                console.error(`Missing required config: ${path}`);
                return false;
            }
        }

        return true;
    } catch (error) {
        console.error('Config validation failed:', error);
        return false;
    }
};

// 在模块加载时验证配置
if (typeof window !== 'undefined') {
    window.addEventListener('load', function() {
        if (!window.RefExtractorConfig.validate()) {
            console.error('RefExtractor configuration validation failed!');
        } else {
            console.log('RefExtractor configuration loaded successfully');
        }
    });
}

// 导出配置对象（兼容不同模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.RefExtractorConfig;
}
