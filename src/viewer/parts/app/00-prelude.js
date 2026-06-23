    // 通过 file:// 打开时会触发跨域限制，导致本地接口数据不可用。
    // 自动跳转到本地服务地址，保留当前 hash 路由。
    if (window.location.protocol === 'file:') {
      var target = 'http://localhost:3114/' + (window.location.hash || '#dashboard');
      window.location.replace(target);
    }

    var params = new URLSearchParams(window.location.search);
    var paramPort = params.get('port');
    var locPort = window.location.port;
    var hasHost = !!window.location.hostname;
    var hostName = hasHost ? window.location.hostname : 'localhost';
    var wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    var REST, WS_URL, WS_DIRECT_URL, wsPort;
    if (paramPort) {
      var resolvedPort = parseInt(paramPort) === 3111 ? '3114' : paramPort;
      REST = window.location.protocol + '//' + hostName + ':' + resolvedPort;
      wsPort = params.get('wsPort') || String(parseInt(resolvedPort) - 1);
      WS_URL = wsProto + '//' + hostName + ':' + wsPort;
      WS_DIRECT_URL = WS_URL + '/stream/mem-live/viewer';
    } else if (locPort) {
      var resolvedPort = parseInt(locPort) === 3111 ? '3114' : locPort;
      REST = window.location.protocol + '//' + hostName + ':' + resolvedPort;
      wsPort = params.get('wsPort') || String(parseInt(resolvedPort) - 1);
      WS_URL = wsProto + '//' + hostName + ':' + wsPort;
      WS_DIRECT_URL = WS_URL + '/stream/mem-live/viewer';
    } else {
      // file:// 场景下，origin/host 为空；默认回退到本地 agentmemory 服务。
      var fallbackPort = parseInt(params.get('port') || '3114', 10);
      if (Number.isNaN(fallbackPort)) fallbackPort = 3114;
      REST = 'http://' + hostName + ':' + fallbackPort;
      wsPort = params.get('wsPort') || String(fallbackPort - 1);
      WS_URL = wsProto + '//' + hostName + ':' + wsPort;
      WS_DIRECT_URL = WS_URL + '/stream/mem-live/viewer';
    }

    function isDarkMode() { return document.documentElement.dataset.theme === 'dark'; }
    function applyTheme(dark, persist) {
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      var btn = document.getElementById('theme-toggle');
      if (btn) btn.textContent = dark ? 'LIGHT' : 'DARK';
      if (persist) localStorage.setItem('agentmemory-theme', dark ? 'dark' : 'light');
    }
    window.toggleTheme = function() { applyTheme(!isDarkMode(), true); };
    var savedTheme = localStorage.getItem('agentmemory-theme');
    if (savedTheme) {
      applyTheme(savedTheme === 'dark', false);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      applyTheme(true, false);
    }

    var NODE_COLORS = {
      file: '#2D6A4F', function: '#1D4E89', concept: '#B8860B', error: '#CC0000',
      decision: '#6B3FA0', pattern: '#2563EB', library: '#C2410C', person: '#111111'
    };
    var OP_BADGES = {
      observe: 'badge-blue', compress: 'badge-cyan', remember: 'badge-green',
      forget: 'badge-red', evolve: 'badge-purple', consolidate: 'badge-yellow',
      share: 'badge-orange', delete: 'badge-red', import: 'badge-blue', export: 'badge-blue'
    };
    var TYPE_BADGES = {
      pattern: 'badge-purple', preference: 'badge-blue', architecture: 'badge-cyan',
      bug: 'badge-red', workflow: 'badge-green', fact: 'badge-yellow',
      profile: 'badge-muted', history: 'badge-muted', project: 'badge-green'
    };
    var OBS_TYPE_COLORS = {
      file_read: '#1D4E89', file_write: '#2D6A4F', file_edit: '#B8860B',
      command_run: '#C2410C', search: '#2563EB', web_fetch: '#6B3FA0',
      conversation: '#111111', error: '#CC0000', decision: '#B8860B',
      discovery: '#2D6A4F', subagent: '#6B3FA0', notification: '#0E7490',
      task: '#1D4E89', other: '#666666'
    };
    var OBS_TYPE_ICONS = {
      file_read: '&#128196;', file_write: '&#9999;', file_edit: '&#128221;',
      command_run: '&#9889;', search: '&#128270;', web_fetch: '&#127760;',
      conversation: '&#128172;', error: '&#9888;', decision: '&#129300;',
      discovery: '&#128161;', subagent: '&#129302;', notification: '&#128276;',
      task: '&#9745;', other: '&#128196;'
    };
    // === i18n base (PLAN-001 STEP-01) ===
    // Lightweight inline i18n: a keyed {en, zh} catalog + t(key) lookup.
    // Display labels live here, keyed BY the stored lowercase enum, so switching
    // language never touches Action.status / statusFilter literals.
    // ponytail: inline single-file base; promote to a shared module only if a
    // second surface (extension) needs the same catalog.
    /* i18n-core:start */
    var I18N_MESSAGES = {
      en: {
        'tab.dashboard': 'Overview', 'tab.actions': 'To-Do', 'tab.sessions': 'Evidence',
        'status.pending': 'Pending', 'status.active': 'In progress', 'status.done': 'Done',
        'status.blocked': 'Blocked', 'status.cancelled': 'Cancelled',
        'filter.review': 'To confirm', 'filter.all': 'All',
        'dash.firstRun.kicker': 'First run',
        'dash.firstRun.title': 'Import sample data first',
        'dash.firstRun.body': 'No session data yet. Run the demo and the page will fill with browsable to-dos and activity.',
        'dash.firstRun.link': 'View quick start &rarr;',
        'dash.noRecord': 'No records yet',
        'dash.stat.sessions': 'Sessions',
        'dash.stat.recent': 'Latest',
        'dash.stat.todos': 'Todos',
        'dash.stat.openWorkbench': 'Open workbench',
        'dash.stat.replyQueue': 'Reply queue',
        'dash.stat.actionCandidates': 'Action candidates',
        'dash.stat.pendingActions': 'Pending actions',
        'dash.stat.memories': 'Memories',
        'dash.stat.latestVersion': 'Latest version',
        'dash.stat.lessons': 'Lessons',
        'dash.stat.lessonsSub': 'Lessons to organize',
        'dash.stat.graphNodes': 'Graph nodes',
        'dash.stat.edges': 'Edges',
        'dash.stat.status': 'Status',
        'dash.stat.toolCalls': 'Tool calls',
        'dash.stat.tracking': 'Tracking',
        'dash.stat.functions': 'functions',
        'dash.stat.circuitBreaker': 'Circuit breaker',
        'dash.stat.failed': 'Failed',
        'dash.stat.times': 'times',
        'dash.systemResources': 'System resources',
        'dash.alerts': 'Alerts',
        'dash.notes': 'Notes',
        'dash.recentSessions': 'Recent sessions',
        'dash.emptySessions': 'No session data yet. Run the demo or connect your workflow.',
        'dash.unnamedSession': 'Unnamed session',
        'dash.openLatestSyncOf': 'Open latest sync of',
        'dash.syncs': 'syncs',
        'dash.records': 'records',
        'dash.lastSync': 'Last sync',
        'dash.functionMetrics': 'Function metrics (OTel)',
        'dash.workers': 'Workers',
        'dash.circuitBreakerDetail': 'Circuit breaker detail',
        'dash.semanticMemory': 'Semantic memory',
        'dash.emptySemantic': 'No semantic memory yet; the system distills it from observations over time.',
        'dash.proceduralMemory': 'Procedural memory',
        'dash.emptyProcedural': 'No procedural memory yet; repeated patterns are extracted automatically.',
        'dash.consolidationStatus': 'Consolidation status',
        'dash.memoryRelations': 'Memory relations',
        'act.attn.next': 'Next', 'act.attn.needsWork': 'Needs work', 'act.attn.noteworthy': 'Noteworthy',
        'act.prio.high': 'Important', 'act.prio.normal': 'Normal', 'act.prio.low': 'Low',
        'act.untitled': 'Untitled', 'act.untitledCandidate': 'Untitled candidate',
        'act.metric.waiting': 'Awaiting reply', 'act.metric.review': 'To confirm', 'act.metric.followUp': 'To follow up', 'act.metric.active': 'In progress', 'act.metric.done': 'Done',
        'act.searchPlaceholder': 'Search todos...',
        'act.nToConfirm': 'to confirm', 'act.nConfirmed': 'confirmed', 'act.refresh': 'Refresh',
        'act.viewOriginal': 'View original', 'act.confirm': 'Confirm', 'act.ignore': 'Ignore',
        'act.from': 'From', 'act.viewSource': 'View source →', 'act.updated': 'Updated',
        'act.extract.title': 'Use LLM to organize recent sessions',
        'act.extract.run': 'Organize with LLM',
        'act.extract.running': 'Organizing...',
        'act.extract.done': 'Organized',
        'act.extract.rules': 'LLM unavailable',
        'act.extract.error': 'Organize failed',
        'act.extract.failedExisting': 'Extraction failed; showing existing todos',
        'act.extract.loading': 'Loading todos...',
        'act.extract.starting': 'Organizing recent sessions...',
        'act.extract.background': 'Latest todos are shown; still organizing...',
        'act.extract.doneLlm': 'LLM extraction complete',
        'act.extract.doneMixed': 'Partial LLM extraction complete',
        'act.extract.doneRules': 'Rules extraction complete',
        'act.extract.created': 'new',
        'act.extract.history': 'history',
        'act.extract.discarded': 'discarded',
        'act.extract.cleaned': 'cleaned',
        'act.extract.reason': 'reason',
        'act.cleanup.title': 'Update recorded cards from sessions that changed',
        'act.cleanup.run': 'Update',
        'act.cleanup.running': 'Updating...',
        'act.cleanup.applying': 'Applying updates...',
        'act.cleanup.done': 'Updated',
        'act.cleanup.error': 'Update failed',
        'act.cleanup.failed': 'Update failed; cards unchanged',
        'act.cleanup.clean': 'All cards are up to date',
        'act.cleanup.llmUnavailable': 'LLM unavailable — no changes',
        'act.cleanup.confirm': 'Apply these updates?',
        'act.cleanup.summary': 'update {rewritten} · done {completed} · drop {dropped} · merge {merged}',
        'act.status.complete': 'Complete',
        'act.status.archive': 'Archive',
        'act.status.delete': 'Delete',
        'act.itemsUnit': 'items',
        'act.empty.title': 'No todos yet',
        'act.empty.lead': 'This is where todos, blocked items, and completed work extracted from your sessions will appear.',
        'settings.title': 'Settings',
        'settings.subtitle': 'Local configuration is written to the user config file and takes effect after restarting the service.',
        'settings.close': 'Close',
        'settings.language': 'UI language',
        'settings.extractor': 'LLM extraction config',
        'settings.sinceDays': 'Look-back window (days): only sessions from the last N days',
        'settings.maxInteractions': 'Max interaction records per session (one user request → agent reply)',
        'settings.apiKeyKeep': 'Enter a new API key to replace it, or leave blank to keep the current key',
        'settings.apiKeyMissing': 'Not configured',
        'settings.apiKeyLabel': 'API key:',
        'settings.save': 'Save config',
        'settings.saving': 'Saving...',
        'settings.savedRestart': 'Config saved. Restart the service to apply it.',
        'settings.saveFailed': 'Config save failed',
        'act.status.updateFailed': 'Todo status update failed',
        'obs.type.file_read': 'Read file',
        'obs.type.file_write': 'Write file',
        'obs.type.file_edit': 'Edit file',
        'obs.type.command_run': 'Run command',
        'obs.type.search': 'Search',
        'obs.type.web_fetch': 'Web fetch',
        'obs.type.conversation': 'Conversation',
        'obs.type.error': 'Error',
        'obs.type.decision': 'Decision',
        'obs.type.discovery': 'Discovery',
        'obs.type.subagent': 'Subagent',
        'obs.type.notification': 'Notification',
        'obs.type.task': 'Task',
        'obs.type.image': 'Image',
        'obs.type.other': 'Other',
        'obs.summary.localOperation': 'Run local operation',
        'obs.summary.restartService': 'Restart AI Todo service',
        'obs.summary.startService': 'Start AI Todo service',
        'obs.summary.openPreview': 'Open AI Todo preview',
        'obs.summary.checkService': 'Check service status',
        'obs.summary.verifyPageFix': 'Verify page fix',
        'obs.summary.viewFixLog': 'View fix log',
        'obs.summary.checkBrowserAutomation': 'Check browser automation dependency',
        'obs.summary.checkProcess': 'Check local service process',
        'obs.summary.organizeLocalFiles': 'Organize local files',
        'obs.summary.readLocalServiceData': 'Read local service data',
        'obs.summary.viewLocalFiles': 'View local file content',
        'obs.summary.runProjectScript': 'Run project script',
        'obs.summary.checkCodeVersion': 'Check or update code version',
        'obs.summary.runLocalCommand': 'Run local command',
        'obs.output.noText': 'This step completed without extra output.',
        'obs.output.serviceOk': 'The result is healthy and the service is available.',
        'obs.output.npxMissing': 'Check result: npx is not available in this environment.',
        'obs.output.npxOk': 'Check result: browser automation dependency is available.',
        'obs.output.pageFixOk': 'Check result: the page contains the expected fix.',
        'obs.output.error': 'The command returned an error and needs follow-up.',
        'obs.output.readService': 'Read data returned by the local service.',
        'obs.output.viewFiles': 'Viewed local file content to confirm current state.',
        'obs.output.done': 'This step completed and returned output.',
        'obs.display.promptSubmit': 'User request',
        'obs.display.agentMessage': 'Assistant response',
        'obs.display.updatePlan': 'Update plan',
        'obs.display.updatePlanBody': 'The task plan was updated.',
        'obs.display.applyPatch': 'Update local files',
        'obs.display.applyPatchBody': 'Code changes were applied.',
        'obs.display.toolTrace': 'This step was recorded as a structured tool event.',
        'episode.type.file_read': 'Read material',
        'episode.type.file_write': 'Write file',
        'episode.type.file_edit': 'Edit file',
        'episode.type.command_run': 'Local operation',
        'episode.type.search': 'Search',
        'episode.type.web_fetch': 'Web material',
        'episode.type.conversation': 'Conversation progress',
        'episode.type.error': 'Error triage',
        'episode.type.decision': 'Decision record',
        'episode.type.discovery': 'Discovery',
        'episode.type.subagent': 'Collaboration task',
        'episode.type.notification': 'Reminder',
        'episode.type.task': 'Task progress',
        'episode.type.other': 'Other',
        'episode.kind.user_need': 'User request',
        'episode.kind.bugfix': 'Fix record',
        'episode.kind.research': 'Project research',
        'episode.kind.file_work': 'File work',
        'episode.kind.important': 'Important segment',
        'episode.kind.work': 'Work progress',
        'episode.workSegment': 'Work segment',
        'episode.record': 'records',
        'episode.bodyPrefix': 'This segment mainly contains ',
        'episode.bodySuffix': ', summarized from low-level records.',
        'project.uncategorized': 'Uncategorized',
        'project.all': 'All projects',
        'project.browser': 'Browser',
        'project.demo': 'Demo data',
        'source.local': 'Local record',
        'source.agentMarked': 'Agent wrote a source marker',
        'source.demoNote': 'From the demo command, not real user work',
        'source.importedClaude': 'Claude Code history import',
        'source.importedClaudeNote': 'Imported from local JSONL history',
        'source.pathInferred': 'Inferred from project path',
        'source.unknownAgentNote': 'This session does not identify which agent created it',
        'agent.avatarAlt': 'avatar',
        'ses.noRecordId': 'no record ID',
        'tab.memories': 'Memories', 'tab.lessons': 'Lessons', 'tab.graph': 'Graph', 'tab.timeline': 'Timeline', 'tab.activity': 'Live', 'tab.profile': 'Profile', 'tab.audit': 'Audit', 'tab.replay': 'Replay', 'tab.crystals': 'Crystals',
        'ses.emptyNeedRetry': 'No sessions read yet — make sure the local service is running, then retry.',
        'ses.empty': 'No sessions yet', 'ses.retry': 'Retry', 'ses.allSessions': 'All sessions',
        'ses.heroTitle': 'Sessions',
        'ses.heroNote': 'Sessions from your browser and local agents land here; browse them by folder or source.',
        'ses.unitSessions': 'sessions', 'ses.unitFolders': 'folders', 'ses.unitSources': 'sources', 'ses.unitRecords': 'records', 'ses.recordsUnit': 'records',
        'ses.groupModeAria': 'Group sessions by', 'ses.byFolder': 'By folder', 'ses.bySource': 'By source',
        'ses.groupAria': 'Session groups', 'ses.source': 'Source', 'ses.folder': 'Folder',
        'ses.emptyFolder': 'No sessions in this folder yet.', 'ses.emptySource': 'No sessions from this source yet.',
        'ses.noPreview': 'No preview — click to view the full session.',
        'ses.avatarFallback': 'S', 'ses.localRecord': 'Local record'
      },
      zh: {
        'tab.dashboard': '总览', 'tab.actions': '待办', 'tab.sessions': '证据',
        'status.pending': '待处理', 'status.active': '进行中', 'status.done': '已完成',
        'status.blocked': '受阻', 'status.cancelled': '已取消',
        'filter.review': '待确认', 'filter.all': '全部',
        'dash.firstRun.kicker': '首次使用',
        'dash.firstRun.title': '先导入示例数据',
        'dash.firstRun.body': '目前还没有会话数据。先运行 demo，页面就会出现可浏览的待办与活动。',
        'dash.firstRun.link': '查看快速开始 &rarr;',
        'dash.noRecord': '暂无记录',
        'dash.stat.sessions': '会话',
        'dash.stat.recent': '最近',
        'dash.stat.todos': '待办',
        'dash.stat.openWorkbench': '打开工作台',
        'dash.stat.replyQueue': '待回复队列',
        'dash.stat.actionCandidates': '行动候选',
        'dash.stat.pendingActions': '待跟进行动',
        'dash.stat.memories': '记忆',
        'dash.stat.latestVersion': '最新版本',
        'dash.stat.lessons': '经验',
        'dash.stat.lessonsSub': '可整理经验',
        'dash.stat.graphNodes': '关系节点',
        'dash.stat.edges': '连线',
        'dash.stat.status': '状态',
        'dash.stat.toolCalls': '工具调用',
        'dash.stat.tracking': '追踪',
        'dash.stat.functions': '个函数',
        'dash.stat.circuitBreaker': '熔断器',
        'dash.stat.failed': '失败',
        'dash.stat.times': '次',
        'dash.systemResources': '系统资源',
        'dash.alerts': '告警',
        'dash.notes': '备注',
        'dash.recentSessions': '最近会话',
        'dash.emptySessions': '还没有会话数据。先运行 demo 或接入你的工作流。',
        'dash.unnamedSession': '未命名会话',
        'dash.openLatestSyncOf': '打开最新同步 ·',
        'dash.syncs': '次同步',
        'dash.records': '条记录',
        'dash.lastSync': '最近同步',
        'dash.functionMetrics': '函数指标 (OTel)',
        'dash.workers': '工作进程',
        'dash.circuitBreakerDetail': '熔断器详情',
        'dash.semanticMemory': '语义记忆',
        'dash.emptySemantic': '还没有语义记忆，系统会逐步从观察中沉淀。',
        'dash.proceduralMemory': '流程记忆',
        'dash.emptyProcedural': '还没有流程记忆，重复模式会自动提炼。',
        'dash.consolidationStatus': '归并状态',
        'dash.memoryRelations': '记忆关系',
        'act.attn.next': '下一步', 'act.attn.needsWork': '需要处理', 'act.attn.noteworthy': '值得关注',
        'act.prio.high': '重要', 'act.prio.normal': '普通', 'act.prio.low': '不急',
        'act.untitled': '未命名待办', 'act.untitledCandidate': '未命名待办候选',
        'act.metric.waiting': '待回应', 'act.metric.review': '待确认', 'act.metric.followUp': '待跟进', 'act.metric.active': '进行中', 'act.metric.done': '已完成',
        'act.searchPlaceholder': '搜索待办...',
        'act.nToConfirm': '条待确认', 'act.nConfirmed': '件已确认', 'act.refresh': '刷新',
        'act.viewOriginal': '查看原文', 'act.confirm': '确认', 'act.ignore': '忽略',
        'act.from': '来自', 'act.viewSource': '看原文 →', 'act.updated': '更新',
        'act.extract.title': '调用大模型整理最近会话',
        'act.extract.run': '用大模型整理',
        'act.extract.running': '整理中...',
        'act.extract.done': '已整理',
        'act.extract.rules': '未走大模型',
        'act.extract.error': '整理失败',
        'act.extract.failedExisting': '抽取失败，已显示现有待办',
        'act.extract.loading': '正在整理待办...',
        'act.extract.starting': '正在从最近会话整理待办...',
        'act.extract.background': '已显示最新待办，后台仍在整理...',
        'act.extract.doneLlm': '大模型整理完成',
        'act.extract.doneMixed': '部分大模型整理完成',
        'act.extract.doneRules': '未走大模型，已用规则整理',
        'act.extract.created': '新增',
        'act.extract.history': '历史',
        'act.extract.discarded': '丢弃',
        'act.extract.cleaned': '清理',
        'act.extract.reason': '原因',
        'act.cleanup.title': '用大模型更新已记录的卡片（来源会话有新进展时）',
        'act.cleanup.run': '更新',
        'act.cleanup.running': '更新中...',
        'act.cleanup.applying': '正在应用更新...',
        'act.cleanup.done': '已更新',
        'act.cleanup.error': '更新失败',
        'act.cleanup.failed': '更新失败，卡片未改动',
        'act.cleanup.clean': '卡片已是最新',
        'act.cleanup.llmUnavailable': '大模型不可用 — 未改动',
        'act.cleanup.confirm': '应用这些更新？',
        'act.cleanup.summary': '更新 {rewritten} · 完成 {completed} · 丢弃 {dropped} · 合并 {merged}',
        'act.status.complete': '完成',
        'act.status.archive': '归档',
        'act.status.delete': '删除',
        'act.itemsUnit': '件',
        'act.empty.title': '还没有待办',
        'act.empty.lead': '这里会放从会话里整理出的待办、卡住事项和已完成事项。',
        'settings.title': '设置',
        'settings.subtitle': '本机配置会写入用户配置文件，重启服务后生效。',
        'settings.close': '关闭',
        'settings.language': '界面语言',
        'settings.extractor': '大模型抽取配置',
        'settings.sinceDays': '回溯天数：只抽取最近 N 天内的会话',
        'settings.maxInteractions': '每会话最多交互记录数（一次用户派发→Agent 回复为一条）',
        'settings.apiKeyKeep': '输入新 API key 覆盖，留空保持不变',
        'settings.apiKeyMissing': '未配置',
        'settings.apiKeyLabel': 'API key:',
        'settings.save': '保存配置',
        'settings.saving': '保存中...',
        'settings.savedRestart': '配置已保存，重启后生效。',
        'settings.saveFailed': '配置保存失败',
        'act.status.updateFailed': '待办状态更新失败',
        'obs.type.file_read': '读取文件',
        'obs.type.file_write': '写入文件',
        'obs.type.file_edit': '编辑文件',
        'obs.type.command_run': '执行命令',
        'obs.type.search': '搜索',
        'obs.type.web_fetch': '网页获取',
        'obs.type.conversation': '对话',
        'obs.type.error': '错误',
        'obs.type.decision': '决策',
        'obs.type.discovery': '发现',
        'obs.type.subagent': '子代理',
        'obs.type.notification': '通知',
        'obs.type.task': '任务',
        'obs.type.image': '图片',
        'obs.type.other': '其它',
        'obs.summary.localOperation': '执行本地操作',
        'obs.summary.restartService': '重启 AI Todo 服务',
        'obs.summary.startService': '启动 AI Todo 服务',
        'obs.summary.openPreview': '打开 AI Todo 预览',
        'obs.summary.checkService': '检查服务状态',
        'obs.summary.verifyPageFix': '验证页面修复是否生效',
        'obs.summary.viewFixLog': '查看修复日志',
        'obs.summary.checkBrowserAutomation': '检查浏览器自动化工具是否可用',
        'obs.summary.checkProcess': '检查本地服务进程',
        'obs.summary.organizeLocalFiles': '整理本地文件',
        'obs.summary.readLocalServiceData': '读取本地服务数据',
        'obs.summary.viewLocalFiles': '查看本地文件内容',
        'obs.summary.runProjectScript': '运行项目脚本',
        'obs.summary.checkCodeVersion': '检查或更新代码版本',
        'obs.summary.runLocalCommand': '执行本地命令',
        'obs.output.noText': '这一步已执行，没有返回额外文本。',
        'obs.output.serviceOk': '结果正常，服务已经可用。',
        'obs.output.npxMissing': '检查结果：当前环境没有可用的 npx。',
        'obs.output.npxOk': '检查结果：浏览器自动化工具依赖可用。',
        'obs.output.pageFixOk': '检查结果：页面里已经包含对应修复逻辑。',
        'obs.output.error': '执行返回了错误信息，需要继续排查。',
        'obs.output.readService': '已读取本地服务返回的数据。',
        'obs.output.viewFiles': '已查看本地文件内容，用于确认当前状态。',
        'obs.output.done': '这一步已完成，并返回了执行结果。',
        'obs.display.promptSubmit': '用户提出需求',
        'obs.display.agentMessage': '助手回应',
        'obs.display.updatePlan': '更新执行计划',
        'obs.display.updatePlanBody': '已更新任务计划。',
        'obs.display.applyPatch': '更新本地文件',
        'obs.display.applyPatchBody': '已应用代码修改。',
        'obs.display.toolTrace': '这一步已记录为结构化工具事件。',
        'episode.type.file_read': '读取资料',
        'episode.type.file_write': '写入文件',
        'episode.type.file_edit': '修改文件',
        'episode.type.command_run': '本地操作',
        'episode.type.search': '搜索定位',
        'episode.type.web_fetch': '网页资料',
        'episode.type.conversation': '对话推进',
        'episode.type.error': '异常排查',
        'episode.type.decision': '决策记录',
        'episode.type.discovery': '发现线索',
        'episode.type.subagent': '协作任务',
        'episode.type.notification': '提醒',
        'episode.type.task': '任务推进',
        'episode.type.other': '其它',
        'episode.kind.user_need': '用户需求',
        'episode.kind.bugfix': '修复记录',
        'episode.kind.research': '项目研究',
        'episode.kind.file_work': '文件整理',
        'episode.kind.important': '重要片段',
        'episode.kind.work': '工作推进',
        'episode.workSegment': '工作片段',
        'episode.record': '记录',
        'episode.bodyPrefix': '这一段主要包含 ',
        'episode.bodySuffix': '，已从底层记录整理成可读片段。',
        'project.uncategorized': '未归类',
        'project.all': '全部项目',
        'project.browser': '浏览器',
        'project.demo': '演示数据',
        'source.local': '本地记录',
        'source.agentMarked': 'Agent 已写入来源标记',
        'source.demoNote': '来自 demo 命令，不代表你的真实工作',
        'source.importedClaude': 'Claude Code 历史导入',
        'source.importedClaudeNote': '从本地 JSONL 历史记录导入',
        'source.pathInferred': '按项目路径识别',
        'source.unknownAgentNote': '这条会话没有写明来自哪个 Agent',
        'agent.avatarAlt': '头像',
        'ses.noRecordId': '无记录 ID',
        'tab.memories': '记忆', 'tab.lessons': '经验', 'tab.graph': '图谱', 'tab.timeline': '时间线', 'tab.activity': '实时', 'tab.profile': '档案', 'tab.audit': '审计', 'tab.replay': '回放', 'tab.crystals': '结晶',
        'ses.emptyNeedRetry': '暂时没有读到会话，请确认本地服务已启动后重试。',
        'ses.empty': '暂无会话', 'ses.retry': '重试加载', 'ses.allSessions': '全部会话',
        'ses.heroTitle': '会话',
        'ses.heroNote': '浏览器和本地 Agent 的会话会汇入这里，可以按文件夹或来源查看。',
        'ses.unitSessions': '段会话', 'ses.unitFolders': '个文件夹', 'ses.unitSources': '个来源', 'ses.unitRecords': '条记录', 'ses.recordsUnit': '条',
        'ses.groupModeAria': '会话分组方式', 'ses.byFolder': '按文件夹', 'ses.bySource': '按来源',
        'ses.groupAria': '会话分组', 'ses.source': '来源', 'ses.folder': '文件夹',
        'ses.emptyFolder': '这个文件夹下暂时没有会话。', 'ses.emptySource': '这个来源下暂时没有会话。',
        'ses.noPreview': '暂无预览，点击查看完整过程。',
        'ses.avatarFallback': '会', 'ses.localRecord': '本地记录'
      }
    };
    var I18N_LANG = 'en';
    function t(key, fallback) {
      var table = I18N_MESSAGES[I18N_LANG] || {};
      if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
      if (Object.prototype.hasOwnProperty.call(I18N_MESSAGES.en, key)) return I18N_MESSAGES.en[key];
      return fallback != null ? fallback : key;
    }
    function statusLabel(status) { return t('status.' + status, status); }
    /* i18n-core:end */
    (function () {
      try {
        var lang = new URLSearchParams(window.location.search).get('lang') || localStorage.getItem('agentmemory-lang');
        if (lang === 'en' || lang === 'zh') I18N_LANG = lang;
      } catch (e) { /* no URL access — keep default */ }
    })();
    function applyI18n(root) {
      var scope = root || document;
      scope.querySelectorAll('[data-i18n]').forEach(function (el) {
        el.textContent = t(el.getAttribute('data-i18n'));
      });
      var gear = document.getElementById('settings-gear');
      if (gear) {
        gear.setAttribute('aria-label', t('settings.title'));
        gear.setAttribute('title', t('settings.title'));
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { applyI18n(); });
    } else {
      applyI18n();
    }
    // === /i18n base ===
    function observationTypeLabel(type) {
      var key = String(type || 'other');
      return t('obs.type.' + key, key.replace(/_/g, ' '));
    }
    var CB_STATE_COLORS = { closed: 'badge-green', open: 'badge-red', 'half-open': 'badge-yellow' };
    var TAB_IDS = ['dashboard', 'actions', 'sessions'];
    var TAB_REDIRECTS = { memories: 'dashboard', lessons: 'dashboard', activity: 'sessions', graph: 'dashboard', profile: 'dashboard', audit: 'dashboard', replay: 'dashboard', timeline: 'sessions', crystals: 'dashboard' };
    // 专家模式:默认三栏干净;开启后在导航末尾恢复被砍/被隐藏的视图(后端资产不丢)。
    // 这些视图的 view 容器与渲染函数都还在文件里,本步只是放行入口。
    var EXPERT_TABS = [
      { id: 'memories', label: 'tab.memories' },
      { id: 'lessons', label: 'tab.lessons' },
      { id: 'graph', label: 'tab.graph' },
      { id: 'timeline', label: 'tab.timeline' },
      { id: 'activity', label: 'tab.activity' },
      { id: 'profile', label: 'tab.profile' },
      { id: 'audit', label: 'tab.audit' },
      { id: 'replay', label: 'tab.replay' },
      { id: 'crystals', label: 'tab.crystals' }
    ];
    function expertModeEnabled() {
      try {
        var q = new URLSearchParams(window.location.search);
        if (q.get('expert') === '1') return true;
        if (q.get('expert') === '0') return false;
      } catch (_) {}
      try { return localStorage.getItem('viewer_expert_mode') === '1'; } catch (_) { return false; }
    }
    function setExpertMode(on) {
      try { localStorage.setItem('viewer_expert_mode', on ? '1' : '0'); } catch (_) {}
    }
    // 把被隐藏视图的按钮渲染进导航(仅专家模式)。幂等:每次先清掉旧的再按需重建。
    function renderExpertTabs() {
      var bar = document.getElementById('tab-bar');
      if (!bar) return;
      var on = expertModeEnabled();
      var existing = document.getElementById('tab-expert-group');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      var toggle = document.getElementById('expert-toggle');
      if (toggle) toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (!on) return;
      var main = bar.querySelector('.tab-main');
      if (!main) return;
      var group = document.createElement('span');
      group.id = 'tab-expert-group';
      group.className = 'tab-expert-group';
      EXPERT_TABS.forEach(function(tab) {
        var b = document.createElement('button');
        b.setAttribute('data-tab', tab.id);
        b.className = 'tab-expert-btn';
        b.textContent = t(tab.label);
        group.appendChild(b);
      });
      main.appendChild(group);
    }
    function toggleExpertMode() {
      var next = !expertModeEnabled();
      setExpertMode(next);
      renderExpertTabs();
      // 关闭时若当前停在被隐藏视图,折回总览
      if (!next && EXPERT_TABS.some(function(t) { return t.id === state.activeTab; })) {
        switchTab('dashboard');
      }
    }

    var LOCAL_SKILLS = [{"name":"academic-cv-builder","root":"Agents","path":"~/.agents/skills/academic-cv-builder/SKILL.md"},{"name":"career-changer-translator","root":"Agents","path":"~/.agents/skills/career-changer-translator/SKILL.md"},{"name":"cover-letter-generator","root":"Agents","path":"~/.agents/skills/cover-letter-generator/SKILL.md"},{"name":"creative-portfolio-resume","root":"Agents","path":"~/.agents/skills/creative-portfolio-resume/SKILL.md"},{"name":"executive-resume-writer","root":"Agents","path":"~/.agents/skills/executive-resume-writer/SKILL.md"},{"name":"find-skills","root":"Agents","path":"~/.agents/skills/find-skills/SKILL.md"},{"name":"guizang-social-card-skill","root":"Agents","path":"~/.agents/skills/guizang-social-card-skill/SKILL.md"},{"name":"huashu-design","root":"Agents","path":"~/.agents/skills/huashu-design/SKILL.md"},{"name":"interview-prep-generator","root":"Agents","path":"~/.agents/skills/interview-prep-generator/SKILL.md"},{"name":"job-description-analyzer","root":"Agents","path":"~/.agents/skills/job-description-analyzer/SKILL.md"},{"name":"linkedin-profile-optimizer","root":"Agents","path":"~/.agents/skills/linkedin-profile-optimizer/SKILL.md"},{"name":"offer-comparison-analyzer","root":"Agents","path":"~/.agents/skills/offer-comparison-analyzer/SKILL.md"},{"name":"pdf","root":"Agents","path":"~/.agents/skills/pdf/SKILL.md"},{"name":"portfolio-case-study-writer","root":"Agents","path":"~/.agents/skills/portfolio-case-study-writer/SKILL.md"},{"name":"post-to-xhs","root":"Agents","path":"~/.agents/skills/xiaohongshu/skills/post-to-xhs/SKILL.md"},{"name":"reference-list-builder","root":"Agents","path":"~/.agents/skills/reference-list-builder/SKILL.md"},{"name":"resume-ats-optimizer","root":"Agents","path":"~/.agents/skills/resume-ats-optimizer/SKILL.md"},{"name":"resume-bullet-writer","root":"Agents","path":"~/.agents/skills/resume-bullet-writer/SKILL.md"},{"name":"resume-formatter","root":"Agents","path":"~/.agents/skills/resume-formatter/SKILL.md"},{"name":"resume-quantifier","root":"Agents","path":"~/.agents/skills/resume-quantifier/SKILL.md"},{"name":"resume-section-builder","root":"Agents","path":"~/.agents/skills/resume-section-builder/SKILL.md"},{"name":"resume-tailor","root":"Agents","path":"~/.agents/skills/resume-tailor/SKILL.md"},{"name":"resume-version-manager","root":"Agents","path":"~/.agents/skills/resume-version-manager/SKILL.md"},{"name":"salary-negotiation-prep","root":"Agents","path":"~/.agents/skills/salary-negotiation-prep/SKILL.md"},{"name":"setup-xhs-mcp","root":"Agents","path":"~/.agents/skills/xiaohongshu/skills/setup-xhs-mcp/SKILL.md"},{"name":"social-media-marketing","root":"Agents","path":"~/.agents/skills/social-media-marketing/SKILL.md"},{"name":"tech-resume-optimizer","root":"Agents","path":"~/.agents/skills/tech-resume-optimizer/SKILL.md"},{"name":"weread-skills","root":"Agents","path":"~/.agents/skills/weread-skills/SKILL.md"},{"name":"x-twitter-growth","root":"Agents","path":"~/.agents/skills/x-twitter-growth/SKILL.md"},{"name":"xhs-content-plan","root":"Agents","path":"~/.agents/skills/xiaohongshu/skills/xhs-content-plan/SKILL.md"},{"name":"xhs-explore","root":"Agents","path":"~/.agents/skills/xiaohongshu/skills/xhs-explore/SKILL.md"},{"name":"xhs-interact","root":"Agents","path":"~/.agents/skills/xiaohongshu/skills/xhs-interact/SKILL.md"},{"name":"xhs-login","root":"Agents","path":"~/.agents/skills/xiaohongshu/skills/xhs-login/SKILL.md"},{"name":"xhs-profile","root":"Agents","path":"~/.agents/skills/xiaohongshu/skills/xhs-profile/SKILL.md"},{"name":"xhs-search","root":"Agents","path":"~/.agents/skills/xiaohongshu/skills/xhs-search/SKILL.md"},{"name":"xiaohongshu","root":"Agents","path":"~/.agents/skills/xiaohongshu/SKILL.md"},{"name":"academic-cv-builder","root":"Codex","path":"~/.codex/skills/academic-cv-builder/SKILL.md"},{"name":"aihot","root":"Codex","path":"~/.codex/skills/aihot/SKILL.md"},{"name":"andrej-karpathy-perspective","root":"Codex","path":"~/.codex/skills/nuwa-skill/examples/andrej-karpathy-perspective/SKILL.md"},{"name":"buddyup-next","root":"Codex","path":"~/.codex/skills/buddyup-next/SKILL.md"},{"name":"buddyup-study-abroad-assistant","root":"Codex","path":"~/.codex/skills/buddyup-study-abroad-assistant/SKILL.md"},{"name":"buddyup-xiaohongshu-growth","root":"Codex","path":"~/.codex/skills/buddyup-xiaohongshu-growth/SKILL.md"},{"name":"cai-life-skill","root":"Codex","path":"~/.codex/skills/cai-life-skill/SKILL.md"},{"name":"career-changer-translator","root":"Codex","path":"~/.codex/skills/career-changer-translator/SKILL.md"},{"name":"chatgpt-apps","root":"Codex","path":"~/.codex/skills/chatgpt-apps/SKILL.md"},{"name":"cli-creator","root":"Codex","path":"~/.codex/skills/cli-creator/SKILL.md"},{"name":"cocoloop-main","root":"Codex","path":"~/.codex/skills/cocoloop-main/SKILL.md"},{"name":"cover-letter-generator","root":"Codex","path":"~/.codex/skills/cover-letter-generator/SKILL.md"},{"name":"creative-portfolio-resume","root":"Codex","path":"~/.codex/skills/creative-portfolio-resume/SKILL.md"},{"name":"douban-sync-skill","root":"Codex","path":"~/.codex/skills/douban-sync-skill/SKILL.md"},{"name":"elon-musk-perspective","root":"Codex","path":"~/.codex/skills/nuwa-skill/examples/elon-musk-perspective/SKILL.md"},{"name":"executive-resume-writer","root":"Codex","path":"~/.codex/skills/executive-resume-writer/SKILL.md"},{"name":"feishu-research-docs","root":"Codex","path":"~/.codex/skills/feishu-research-docs/SKILL.md"},{"name":"feynman-perspective","root":"Codex","path":"~/.codex/skills/nuwa-skill/examples/feynman-perspective/SKILL.md"},{"name":"figma-code-connect-components","root":"Codex","path":"~/.codex/skills/figma-code-connect-components/SKILL.md"},{"name":"figma-create-design-system-rules","root":"Codex","path":"~/.codex/skills/figma-create-design-system-rules/SKILL.md"},{"name":"figma","root":"Codex","path":"~/.codex/skills/figma/SKILL.md"},{"name":"gh-address-comments","root":"Codex","path":"~/.codex/skills/gh-address-comments/SKILL.md"},{"name":"hv-analysis","root":"Codex","path":"~/.codex/skills/hv-analysis/SKILL.md"},{"name":"ilya-sutskever-perspective","root":"Codex","path":"~/.codex/skills/nuwa-skill/examples/ilya-sutskever-perspective/SKILL.md"},{"name":"imagegen","root":"Codex","path":"~/.codex/skills/.system/imagegen/SKILL.md"},{"name":"interview-prep-generator","root":"Codex","path":"~/.codex/skills/interview-prep-generator/SKILL.md"},{"name":"job-description-analyzer","root":"Codex","path":"~/.codex/skills/job-description-analyzer/SKILL.md"},{"name":"kevin-kelly-perspective","root":"Codex","path":"~/.codex/skills/kevin-kelly-perspective/SKILL.md"},{"name":"khazix-writer","root":"Codex","path":"~/.codex/skills/khazix-writer/SKILL.md"},{"name":"laws-of-ux-2","root":"Codex","path":"~/.codex/skills/laws-of-ux-2/SKILL.md"},{"name":"linkedin-profile-optimizer","root":"Codex","path":"~/.codex/skills/linkedin-profile-optimizer/SKILL.md"},{"name":"mrbeast-perspective","root":"Codex","path":"~/.codex/skills/nuwa-skill/examples/mrbeast-perspective/SKILL.md"},{"name":"munger-perspective","root":"Codex","path":"~/.codex/skills/nuwa-skill/examples/munger-perspective/SKILL.md"},{"name":"naval-perspective","root":"Codex","path":"~/.codex/skills/nuwa-skill/examples/naval-perspective/SKILL.md"},{"name":"neat-freak","root":"Codex","path":"~/.codex/skills/neat-freak/SKILL.md"},{"name":"nuwa-skill","root":"Codex","path":"~/.codex/skills/nuwa-skill/SKILL.md"},{"name":"offer-comparison-analyzer","root":"Codex","path":"~/.codex/skills/offer-comparison-analyzer/SKILL.md"},{"name":"openai-docs","root":"Codex","path":"~/.codex/skills/.system/openai-docs/SKILL.md"},{"name":"paul-graham-perspective","root":"Codex","path":"~/.codex/skills/nuwa-skill/examples/paul-graham-perspective/SKILL.md"},{"name":"playwright","root":"Codex","path":"~/.codex/skills/playwright/SKILL.md"},{"name":"plugin-creator","root":"Codex","path":"~/.codex/skills/.system/plugin-creator/SKILL.md"},{"name":"portfolio-case-study-writer","root":"Codex","path":"~/.codex/skills/portfolio-case-study-writer/SKILL.md"},{"name":"proactive-everme","root":"Codex","path":"~/.codex/skills/proactive-everme/SKILL.md"},{"name":"reference-list-builder","root":"Codex","path":"~/.codex/skills/reference-list-builder/SKILL.md"},{"name":"resume-ats-optimizer","root":"Codex","path":"~/.codex/skills/resume-ats-optimizer/SKILL.md"},{"name":"resume-bullet-writer","root":"Codex","path":"~/.codex/skills/resume-bullet-writer/SKILL.md"},{"name":"resume-formatter","root":"Codex","path":"~/.codex/skills/resume-formatter/SKILL.md"},{"name":"resume-quantifier","root":"Codex","path":"~/.codex/skills/resume-quantifier/SKILL.md"},{"name":"resume-section-builder","root":"Codex","path":"~/.codex/skills/resume-section-builder/SKILL.md"},{"name":"resume-tailor","root":"Codex","path":"~/.codex/skills/resume-tailor/SKILL.md"},{"name":"resume-version-manager","root":"Codex","path":"~/.codex/skills/resume-version-manager/SKILL.md"},{"name":"salary-negotiation-prep","root":"Codex","path":"~/.codex/skills/salary-negotiation-prep/SKILL.md"},{"name":"self-improvement","root":"Codex","path":"~/.codex/skills/self-improvement/SKILL.md"},{"name":"skill-creator","root":"Codex","path":"~/.codex/skills/.system/skill-creator/SKILL.md"},{"name":"skill-installer","root":"Codex","path":"~/.codex/skills/.system/skill-installer/SKILL.md"},{"name":"speech","root":"Codex","path":"~/.codex/skills/speech/SKILL.md"},{"name":"steve-jobs-perspective","root":"Codex","path":"~/.codex/skills/nuwa-skill/examples/steve-jobs-perspective/SKILL.md"},{"name":"storage-analyzer","root":"Codex","path":"~/.codex/skills/storage-analyzer/SKILL.md"},{"name":"sun-yuchen-perspective","root":"Codex","path":"~/.codex/skills/nuwa-skill/examples/sun-yuchen-perspective/SKILL.md"},{"name":"taleb-perspective","root":"Codex","path":"~/.codex/skills/nuwa-skill/examples/taleb-perspective/SKILL.md"},{"name":"taught-master-applications","root":"Codex","path":"~/.codex/skills/taught-master-applications/SKILL.md"},{"name":"taught-master-applications","root":"Codex","path":"~/.codex/skills/taught-master-applications/taught-master-applications/SKILL.md"},{"name":"tech-resume-optimizer","root":"Codex","path":"~/.codex/skills/tech-resume-optimizer/SKILL.md"},{"name":"trump-perspective","root":"Codex","path":"~/.codex/skills/nuwa-skill/examples/trump-perspective/SKILL.md"},{"name":"x-mastery-mentor","root":"Codex","path":"~/.codex/skills/nuwa-skill/examples/x-mastery-mentor/SKILL.md"},{"name":"zhang-yiming-perspective","root":"Codex","path":"~/.codex/skills/nuwa-skill/examples/zhang-yiming-perspective/SKILL.md"},{"name":"zhangxuefeng-perspective","root":"Codex","path":"~/.codex/skills/nuwa-skill/examples/zhangxuefeng-perspective/SKILL.md"},{"name":"agentmemory-import","root":"Plugin","path":"~/.codex/plugins/cache/agentmemory-lab/agentmemory-lab/0.1.0/skills/agentmemory-import/SKILL.md"},{"name":"agentmemory-understand","root":"Plugin","path":"~/.codex/plugins/cache/agentmemory-lab/agentmemory-lab/0.1.0/skills/agentmemory-understand/SKILL.md"},{"name":"agentmemory","root":"Plugin","path":"~/.codex/plugins/cache/agentmemory-lab/agentmemory-lab/0.1.0/skills/agentmemory/SKILL.md"},{"name":"audit","root":"Plugin","path":"~/.codex/plugins/cache/role-specific-plugins/product-design/0.1.41/skills/audit/SKILL.md"},{"name":"control-in-app-browser","root":"Plugin","path":"~/.codex/plugins/cache/openai-bundled/browser/26.601.21317/skills/control-in-app-browser/SKILL.md"},{"name":"design-qa","root":"Plugin","path":"~/.codex/plugins/cache/role-specific-plugins/product-design/0.1.41/skills/design-qa/SKILL.md"},{"name":"documents","root":"Plugin","path":"~/.codex/plugins/cache/openai-primary-runtime/documents/26.601.10930/skills/documents/SKILL.md"},{"name":"everme-memory","root":"Plugin","path":"~/.codex/plugins/cache/everme/everme/0.4.0/skills/everme-memory/SKILL.md"},{"name":"figma-code-connect","root":"Plugin","path":"~/.codex/plugins/cache/openai-curated/figma/2abb1c44/skills/figma-code-connect/SKILL.md"},{"name":"figma-create-new-file","root":"Plugin","path":"~/.codex/plugins/cache/openai-curated/figma/2abb1c44/skills/figma-create-new-file/SKILL.md"},{"name":"figma-generate-design","root":"Plugin","path":"~/.codex/plugins/cache/openai-curated/figma/2abb1c44/skills/figma-generate-design/SKILL.md"},{"name":"figma-generate-diagram","root":"Plugin","path":"~/.codex/plugins/cache/openai-curated/figma/2abb1c44/skills/figma-generate-diagram/SKILL.md"},{"name":"figma-generate-library","root":"Plugin","path":"~/.codex/plugins/cache/openai-curated/figma/2abb1c44/skills/figma-generate-library/SKILL.md"},{"name":"figma-use-figjam","root":"Plugin","path":"~/.codex/plugins/cache/openai-curated/figma/2abb1c44/skills/figma-use-figjam/SKILL.md"},{"name":"figma-use-slides","root":"Plugin","path":"~/.codex/plugins/cache/openai-curated/figma/2abb1c44/skills/figma-use-slides/SKILL.md"},{"name":"figma-use","root":"Plugin","path":"~/.codex/plugins/cache/openai-curated/figma/2abb1c44/skills/figma-use/SKILL.md"},{"name":"get-context","root":"Plugin","path":"~/.codex/plugins/cache/role-specific-plugins/product-design/0.1.41/skills/get-context/SKILL.md"},{"name":"ideate","root":"Plugin","path":"~/.codex/plugins/cache/role-specific-plugins/product-design/0.1.41/skills/ideate/SKILL.md"},{"name":"image-to-code","root":"Plugin","path":"~/.codex/plugins/cache/role-specific-plugins/product-design/0.1.41/skills/image-to-code/SKILL.md"},{"name":"index","root":"Plugin","path":"~/.codex/plugins/cache/role-specific-plugins/product-design/0.1.41/skills/index/SKILL.md"},{"name":"presentations","root":"Plugin","path":"~/.codex/plugins/cache/openai-primary-runtime/presentations/26.601.10930/skills/presentations/SKILL.md"},{"name":"prototype","root":"Plugin","path":"~/.codex/plugins/cache/role-specific-plugins/product-design/0.1.41/skills/prototype/SKILL.md"},{"name":"research","root":"Plugin","path":"~/.codex/plugins/cache/role-specific-plugins/product-design/0.1.41/skills/research/SKILL.md"},{"name":"share","root":"Plugin","path":"~/.codex/plugins/cache/role-specific-plugins/product-design/0.1.41/skills/share/SKILL.md"},{"name":"spreadsheets","root":"Plugin","path":"~/.codex/plugins/cache/openai-primary-runtime/spreadsheets/26.601.10930/skills/spreadsheets/SKILL.md"},{"name":"understand-chat","root":"Plugin","path":"~/.codex/plugins/cache/understand-anything/plugin-backup-Q98O9D/understand-anything/2.7.5/skills/understand-chat/SKILL.md"},{"name":"understand-chat","root":"Plugin","path":"~/.codex/plugins/cache/understand-anything/understand-anything/2.7.6/skills/understand-chat/SKILL.md"},{"name":"understand-dashboard","root":"Plugin","path":"~/.codex/plugins/cache/understand-anything/plugin-backup-Q98O9D/understand-anything/2.7.5/skills/understand-dashboard/SKILL.md"},{"name":"understand-dashboard","root":"Plugin","path":"~/.codex/plugins/cache/understand-anything/understand-anything/2.7.6/skills/understand-dashboard/SKILL.md"},{"name":"understand-diff","root":"Plugin","path":"~/.codex/plugins/cache/understand-anything/plugin-backup-Q98O9D/understand-anything/2.7.5/skills/understand-diff/SKILL.md"},{"name":"understand-diff","root":"Plugin","path":"~/.codex/plugins/cache/understand-anything/understand-anything/2.7.6/skills/understand-diff/SKILL.md"},{"name":"understand-domain","root":"Plugin","path":"~/.codex/plugins/cache/understand-anything/plugin-backup-Q98O9D/understand-anything/2.7.5/skills/understand-domain/SKILL.md"},{"name":"understand-domain","root":"Plugin","path":"~/.codex/plugins/cache/understand-anything/understand-anything/2.7.6/skills/understand-domain/SKILL.md"},{"name":"understand-explain","root":"Plugin","path":"~/.codex/plugins/cache/understand-anything/plugin-backup-Q98O9D/understand-anything/2.7.5/skills/understand-explain/SKILL.md"},{"name":"understand-explain","root":"Plugin","path":"~/.codex/plugins/cache/understand-anything/understand-anything/2.7.6/skills/understand-explain/SKILL.md"},{"name":"understand-knowledge","root":"Plugin","path":"~/.codex/plugins/cache/understand-anything/plugin-backup-Q98O9D/understand-anything/2.7.5/skills/understand-knowledge/SKILL.md"},{"name":"understand-knowledge","root":"Plugin","path":"~/.codex/plugins/cache/understand-anything/understand-anything/2.7.6/skills/understand-knowledge/SKILL.md"},{"name":"understand-onboard","root":"Plugin","path":"~/.codex/plugins/cache/understand-anything/plugin-backup-Q98O9D/understand-anything/2.7.5/skills/understand-onboard/SKILL.md"},{"name":"understand-onboard","root":"Plugin","path":"~/.codex/plugins/cache/understand-anything/understand-anything/2.7.6/skills/understand-onboard/SKILL.md"},{"name":"understand","root":"Plugin","path":"~/.codex/plugins/cache/understand-anything/plugin-backup-Q98O9D/understand-anything/2.7.5/skills/understand/SKILL.md"},{"name":"understand","root":"Plugin","path":"~/.codex/plugins/cache/understand-anything/understand-anything/2.7.6/skills/understand/SKILL.md"},{"name":"url-to-code","root":"Plugin","path":"~/.codex/plugins/cache/role-specific-plugins/product-design/0.1.41/skills/url-to-code/SKILL.md"},{"name":"user-context","root":"Plugin","path":"~/.codex/plugins/cache/role-specific-plugins/product-design/0.1.41/skills/user-context/SKILL.md"}];

    var state = {
      activeTab: 'dashboard',
      dashboard: { loaded: false, health: null, sessions: [], memories: [], actions: [], actionReviews: [], inboxAwaiting: [], graphStats: null, recentAudit: [], lessons: [], crystals: [], delivery: null },
      dashboardRefresh: { enabled: true, intervalMs: 30000 },
      graph: { loaded: false, nodes: [], edges: [], stats: null, filters: {}, selectedNode: null },
      memories: { loaded: false, items: [], reviewItems: [], search: '', typeFilter: '', sourceFilter: '' },
	      timeline: { loaded: false, observations: [], sessionId: '', projectKey: '', sessions: [], minImportance: 0, page: 0, pageSize: 50, mode: 'episodes', episodeFilter: 'all', expandedEpisodes: {} },
      sessions: { loaded: false, items: [], selectedId: null, groupMode: 'folder', folderKey: 'all', sourceKey: 'all', warnings: [], highlightsById: {}, detailSectionsById: {}, detailCacheById: {}, stale: false, requestSeq: 0, detailRequestSeq: 0, pendingHighlightObsId: null, previewExpandedById: {} },
      audit: { loaded: false, entries: [], opFilter: '' },
      activity: { loaded: false, observations: [], sessions: [], typeFilter: '', loadingPhase: '', warnings: [] },
      lessons: { loaded: false, items: [], search: '', skillSearch: '', skillRootFilter: 'all', mode: 'explicit', projects: [] },
      actions: { loaded: false, items: [], reviewItems: [], frontier: [], statusFilter: '', search: '', doneExpanded: false, extractStatus: '', extractMessage: '', extractInFlight: false, stale: false, config: null, configSaving: false, configDraft: {} },
      inbox: { loaded: false, items: [], awaitingItems: [], answeredItems: [], dismissedItems: [], replyingId: null, pendingById: {}, briefingExpanded: false, answeredExpanded: false },
      crystals: { loaded: false, items: [], search: '', lessonMap: {} },
      profile: { loaded: false, projects: [], selectedProject: '', data: null },
      replay: { loaded: false, sessions: [], selectedId: '', timeline: null, cursor: 0, playing: false, speed: 1, timer: null, startAt: 0, offsetAt: 0 },
      flagsConfig: null,
      flagsDismissed: {},
      settings: { open: false },
      ws: null
    };

