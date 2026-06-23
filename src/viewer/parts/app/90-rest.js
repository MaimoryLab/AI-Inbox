    function cleanSessionPreview(text) {
      var t = String(text || '').trim();
      if (!t) return '';
      var noisyStarts = [
        '# AGENTS.md instructions',
        '<INSTRUCTIONS>',
        'Automation:',
        'Response MUST end with',
        'You are Codex',
        'Filesystem sandboxing defines'
      ];
      for (var i = 0; i < noisyStarts.length; i++) {
        if (t.indexOf(noisyStarts[i]) === 0) return '';
      }
      t = t.replace(/^# In app browser:[\s\S]*?## My request for Codex:\s*/m, '').trim();
      t = t.replace(/^# Browser comments:[\s\S]*?## My request for Codex:\s*/m, '').trim();
      t = t.replace(/^The next image is untrusted page evidence[\s\S]*?instructions\.\s*/m, '').trim();
      return t;
    }
    function normalizePreviewText(text) {
      return cleanSessionPreview(text).replace(/\s+/g, ' ').trim();
    }
    function compactSessionTitle(text) {
      var t = normalizePreviewText(text);
      if (!t) return '';
      t = t.replace(/https?:\/\/\S+/g, '').trim();
      t = t.replace(/\[[^\]]{20,}\]\([^)]+\)/g, '').trim();
      t = t.replace(/[（(][^()（）]{24,}[）)]/g, '').trim();
      t = t.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/^\d+[.、]\s*/, '').trim();
      t = t.replace(/\s+/g, ' ');
      if (t.length > 44) {
        var cut = t.slice(0, 44);
        var stop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('；'), cut.lastIndexOf('，'), cut.lastIndexOf(' '));
        if (stop > 14) cut = cut.slice(0, stop);
        t = cut + '...';
      }
      return t;
    }
    function sessionTitleText(s) {
      return compactSessionTitle(s && (s.title || s.firstPrompt)) || sessionDisplayName(s);
    }
    function sessionBodyPreview(s, title) {
      var candidates = [s && s.summary, s && s.latestPrompt, s && s.firstPrompt];
      var titleText = normalizePreviewText(title);
      for (var i = 0; i < candidates.length; i++) {
        var preview = normalizePreviewText(candidates[i]);
        if (!preview) continue;
        if (titleText && preview === titleText) continue;
        if (titleText && preview.indexOf(titleText) === 0) {
          preview = preview.slice(titleText.length).replace(/^[\s:：,，.。;；-]+/, '').trim();
        }
        if (preview && preview !== titleText) return preview;
      }
      return '';
    }
    function parseJsonObject(text) {
      var raw = String(text || '').trim();
      if (!raw || raw[0] !== '{') return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    }
	    function splitCommandNarrative(text) {
	      var raw = String(text || '').trim();
	      if (!raw) return { command: '', output: '' };
	      var pipeIndex = raw.indexOf(' | ');
	      var left = pipeIndex >= 0 ? raw.slice(0, pipeIndex).trim() : raw;
	      var right = pipeIndex >= 0 ? raw.slice(pipeIndex + 3).trim() : '';
	      var obj = parseJsonObject(left);
	      return { command: obj && obj.command ? String(obj.command) : '', output: right };
	    }
	    function extractCommandText(o) {
	      var rawNarrative = String(o && o.narrative || '').trim();
	      var rawSubtitle = String(o && o.subtitle || '').trim();
	      var first = rawNarrative.indexOf(' | ') >= 0 ? splitCommandNarrative(rawNarrative) : splitCommandNarrative(rawSubtitle);
	      if (first.command || first.output) return first;
	      var second = splitCommandNarrative(rawNarrative);
	      if (second.command || second.output) return second;
	      var ti = o && o.toolInput;
	      if (ti && typeof ti === 'object' && ti.command) return { command: String(ti.command), output: String(o && o.toolOutput || '') };
	      return { command: '', output: '' };
	    }
    function normalizedToolTraceName(value) {
      return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    }
    function isJsonLikeText(text) {
      var trimmed = String(text || '').trim();
      if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return false;
      try {
        JSON.parse(trimmed);
        return true;
      } catch (e) {
        return /^[{\[]/.test(trimmed);
      }
    }
    function looksToolTraceDisplayText(text) {
      var trimmed = String(text || '').trim();
      if (!trimmed) return false;
      var lower = trimmed.toLowerCase();
      return isJsonLikeText(trimmed) || /"plan"\s*:|"command"\s*:|toolinput|tooloutput|function_id/.test(lower);
    }
    function commandHumanSummary(command) {
      var c = String(command || '').trim();
      if (!c) return t('obs.summary.localOperation');
      if (c.indexOf('ensure-agentmemory-live.mjs') >= 0 && c.indexOf('--restart') >= 0) return t('obs.summary.restartService');
      if (c.indexOf('ensure-agentmemory-live.mjs') >= 0) return t('obs.summary.startService');
      if (/^open\s+['"]?https?:\/\/127\.0\.0\.1:3114/.test(c)) return t('obs.summary.openPreview');
      if (c.indexOf('agentmemory/livez') >= 0 || c.indexOf('/health') >= 0) return t('obs.summary.checkService');
      if (c.indexOf('sessionBodyPreview') >= 0 || c.indexOf('observationDisplay') >= 0) return t('obs.summary.verifyPageFix');
      if (c.indexOf('bugfix-log') >= 0 && /sed|cat|ls/.test(c)) return t('obs.summary.viewFixLog');
      if (/command -v npx/.test(c)) return t('obs.summary.checkBrowserAutomation');
      if (/^(ps|lsof|netstat)\b/.test(c) || c.indexOf(' ps ') >= 0 || c.indexOf('lsof ') >= 0) return t('obs.summary.checkProcess');
      if (/^mkdir\b|^mv\b|^cp\b|^node <<|cleanup|重复旧版本|_待确认清理/.test(c)) return t('obs.summary.organizeLocalFiles');
      if (/^curl\b/.test(c)) return t('obs.summary.readLocalServiceData');
      if (/^sed\b|^rg\b|^grep\b|^find\b|^ls\b|^nl\b/.test(c)) return t('obs.summary.viewLocalFiles');
      if (/^(npm|pnpm|bun|yarn)\b/.test(c)) return t('obs.summary.runProjectScript');
      if (/^(git)\b/.test(c)) return t('obs.summary.checkCodeVersion');
      return t('obs.summary.runLocalCommand');
    }
    function commandOutputSummary(output, command) {
      var out = String(output || '').trim();
      var c = String(command || '');
      if (!out) return t('obs.output.noText');
      if (out.indexOf('"ok": true') >= 0 || out.indexOf('"status":"ok"') >= 0 || out.indexOf('"status": "ok"') >= 0) return t('obs.output.serviceOk');
      if (out.indexOf('npx-missing') >= 0) return t('obs.output.npxMissing');
      if (out.indexOf('npx-ok') >= 0) return t('obs.output.npxOk');
      if (out.indexOf('sessionBodyPreview') >= 0 || out.indexOf('observationDisplay') >= 0) return t('obs.output.pageFixOk');
      if (out.indexOf('error') >= 0 || out.indexOf('failed') >= 0 || out.indexOf('Error:') >= 0) return t('obs.output.error');
      if (/^curl\b/.test(c)) return t('obs.output.readService');
      if (/^sed\b|^rg\b|^grep\b|^find\b|^ls\b|^nl\b/.test(c)) return t('obs.output.viewFiles');
      return t('obs.output.done');
    }
	    function observationDisplay(o) {
	      var baseTitle = normalizePreviewText(o && (o.title || o.toolName || (o.hookType ? o.hookType.replace(/_/g, ' ') : 'Observation')));
	      var rawSubtitle = normalizePreviewText(o && o.subtitle);
	      var rawNarrative = normalizePreviewText(o && o.narrative);
	      var commandInfo = extractCommandText(o);
	      var type = o && (o.type || o.hookType || '');
	      var toolName = normalizedToolTraceName(o && (o.toolName || o.title || o.hookType));
	      var title = baseTitle || 'Observation';
	      var subtitle = rawSubtitle;
	      var body = rawNarrative;
	      if (title === 'prompt_submit') title = t('obs.display.promptSubmit');
	      if (title === 'agent_message') title = t('obs.display.agentMessage');
	      if (toolName === 'update_plan') {
	        title = t('obs.display.updatePlan');
	        subtitle = '';
	        body = t('obs.display.updatePlanBody');
	      } else if (toolName === 'apply_patch') {
	        title = t('obs.display.applyPatch');
	        subtitle = '';
	        body = t('obs.display.applyPatchBody');
	      } else if ((type === 'command_run' || toolName === 'bash' || toolName === 'exec_command') && commandInfo.command) {
	        title = commandHumanSummary(commandInfo.command);
	        subtitle = '';
	        body = commandOutputSummary(commandInfo.output, commandInfo.command);
      } else if (rawSubtitle && rawNarrative && rawNarrative.indexOf(rawSubtitle) === 0) {
        body = rawNarrative.slice(rawSubtitle.length).replace(/^[\s|:：,，.。;；-]+/, '').trim();
      }
	      if (looksToolTraceDisplayText(subtitle)) subtitle = '';
	      if (looksToolTraceDisplayText(body)) body = t('obs.display.toolTrace');
	      body = sessionBodyPreview({ summary: body, latestPrompt: rawNarrative, firstPrompt: rawSubtitle }, title);
	      return { title: title, subtitle: subtitle, body: body };
	    }
	    function looksRawSystemText(text) {
	      var t = String(text || '').trim();
	      return t.indexOf('{"command"') >= 0 || t.indexOf('\\\"command\\\"') >= 0 || /^Bash($|[:：])/.test(t) || /^prompt_submit$/.test(t) || /^agent_message$/.test(t);
	    }
	    function cleanEpisodeText(text, fallback) {
	      var t = normalizePreviewText(text);
	      if (!t || looksRawSystemText(t)) return fallback || '';
	      return t;
	    }
	    function episodeActionText(o) {
	      var type = observationType(o);
	      var display = observationDisplay(o);
	      var title = cleanEpisodeText(display.title, typeDisplayLabel(type));
	      var body = cleanEpisodeText(display.body, '');
	      if (body && body !== title) return title + '：' + truncate(body, 64);
	      return title;
	    }
	    function typeDisplayLabel(type) {
	      return t('episode.type.' + (type || 'other'), String(type || t('episode.type.other')).replace(/_/g, ' '));
	    }
	    function episodeKindLabel(kind) {
	      return t('episode.kind.' + (kind || 'work'), t('episode.kind.work'));
	    }
	    function observationType(o) {
	      var toolMap = { Read: 'file_read', Write: 'file_write', Edit: 'file_edit', Bash: 'command_run', Grep: 'search', Glob: 'search', WebFetch: 'web_fetch', WebSearch: 'web_fetch', AskUserQuestion: 'conversation', Task: 'subagent' };
	      return (o && (o.type || toolMap[o.toolName] || (o.hookType ? o.hookType.replace(/_/g, ' ') : 'other'))) || 'other';
	    }
	    function episodeTimeKey(o) {
	      var sid = o && (o._sessionId || o.sessionId);
	      if (sid) return 'session:' + sid;
	      try {
	        var d = new Date(o.timestamp);
	        if (!Number.isNaN(d.getTime())) return 'hour:' + d.toISOString().slice(0, 13);
	      } catch(e) {}
	      return 'misc';
	    }
	    function episodeFallbackTitle(first, projectName) {
	      var name = first && (first._sessionName || first.sessionName);
	      if (name && name !== 'Codex 会话') return name;
	      var d = first && first.timestamp ? formatTime(first.timestamp) : '';
	      return (projectName ? projectName + ' · ' : '') + (d || t('episode.workSegment'));
	    }
	    function classifyEpisode(counts, title, body, importance) {
	      var text = String((title || '') + ' ' + (body || '')).toLowerCase();
	      if ((importance || 0) >= 8 || counts.decision || counts.error) return 'important';
	      if (/修|bug|error|错误|异常|排查|fix|fail|undefined|json|bash/.test(text)) return 'bugfix';
	      if (/解释|研究|github|项目|repo|资料|分析|搜索|tencent|memory/.test(text) || counts.web_fetch || counts.search) return 'research';
	      if (/用户提出需求|需求|继续|优化|启动/.test(text) || counts.conversation) return 'user_need';
	      if (counts.file_write || counts.file_edit || counts.file_read) return 'file_work';
	      return 'work';
	    }
	    function filterTimelineEpisodes(episodes) {
	      var filter = state.timeline.episodeFilter || 'all';
	      if (filter === 'all') return episodes;
	      return episodes.filter(function(ep) {
	        if (filter === 'important') return ep.kind === 'important' || ep.kind === 'user_need' || ep.kind === 'bugfix';
	        return ep.kind === filter;
	      });
	    }
	    function buildTimelineEpisodes(observations) {
	      var project = (state.timeline.sessions || []).find(function(s) { return sessionProjectKey(s) === state.timeline.projectKey; });
	      var projectName = project ? projectDisplayName(project) : '';
	      var buckets = {};
	      (observations || []).forEach(function(o) {
	        var key = episodeTimeKey(o);
	        if (!buckets[key]) buckets[key] = [];
	        buckets[key].push(o);
	      });
	      return Object.keys(buckets).map(function(key) {
	        var items = buckets[key].slice().sort(function(a, b) {
	          return String(a.timestamp || '').localeCompare(String(b.timestamp || ''));
	        });
	        var first = items[0] || {};
	        var last = items[items.length - 1] || first;
	        var counts = {};
	        var actions = [];
	        var title = '';
	        var bodyCandidate = '';
	        items.forEach(function(o) {
	          var type = observationType(o);
	          counts[type] = (counts[type] || 0) + 1;
	          var display = observationDisplay(o);
	          var cleanTitle = cleanEpisodeText(display.title, '');
	          var cleanBody = cleanEpisodeText(display.body, '');
	          if (!title && cleanTitle && cleanTitle !== 'Observation') title = cleanTitle;
	          if (!bodyCandidate && cleanBody) bodyCandidate = cleanBody;
	          var action = episodeActionText(o);
	          if (actions.indexOf(action) < 0) actions.push(action);
	        });
	        var typeText = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; }).slice(0, 4).map(function(t) {
	          return typeDisplayLabel(t) + ' ' + counts[t];
	        }).join('，');
		        var readableTitle = title || episodeFallbackTitle(first, projectName);
		        var readableBody = bodyCandidate || (t('episode.bodyPrefix') + typeText + t('episode.bodySuffix'));
		        var maxImportance = items.reduce(function(max, o) { return Math.max(max, typeof o.importance === 'number' ? o.importance : 5); }, 0);
		        var kind = classifyEpisode(counts, readableTitle, readableBody, maxImportance);
		        return {
		          key: key,
		          title: readableTitle,
		          body: readableBody,
		          actions: actions.slice(0, 6),
		          count: items.length,
		          typeText: typeText || t('episode.record') + ' ' + items.length,
		          start: first.timestamp,
		          end: last.timestamp,
		          importance: maxImportance,
		          kind: kind
		        };
	      }).sort(function(a, b) {
	        return String(b.end || '').localeCompare(String(a.end || ''));
	      });
	    }
    function memoryTypeLabel(t) {
      var map = {
        fact: '事实',
        preference: '偏好',
        profile: '身份档案',
        architecture: '架构',
        workflow: '流程',
        pattern: '模式',
        bug: '问题',
        goal: '目标',
        history: '经历',
        project: '项目',
        principle: '原则',
        lifestyle: '生活'
      };
      return map[t] || t || '未分类';
    }
    function memoryAreaToType(area) {
      var map = {
        profile: 'profile',
        preference: 'preference',
        project: 'project',
        principle: 'pattern',
        history: 'history'
      };
      return map[area] || 'fact';
    }
    function memoryTypeToArea(type, mem) {
      var category = memoryCategory(mem || { type: type });
      if (category === '身份档案') return 'profile';
      if (category === '偏好') return 'preference';
      if (category === '项目与目标') return 'project';
      if (category === '判断框架') return 'principle';
      if (category === '经历') return 'history';
      return type === 'project' ? 'project' : type === 'preference' ? 'preference' : type === 'pattern' || type === 'workflow' ? 'principle' : 'profile';
    }
    function shortDateTime(ts) {
      if (!ts) return '-';
      try {
        var d = new Date(ts);
        return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') +
          ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      } catch {
        return ts;
      }
    }
    function inferAgentFromSession(s) {
      var direct = s.agentId || s.agent || s.agentName || '';
      if (direct) return String(direct);
      var pid = String(s.project || s.cwd || s.id || '').toLowerCase();
      if (pid.indexOf('demo') >= 0) return t('project.demo');
      if (pid.indexOf('codex') >= 0) return 'Codex';
      if (pid.indexOf('claude') >= 0) return 'Claude';
      if (pid.indexOf('cursor') >= 0) return 'Cursor';
      if (pid.indexOf('openclaw') >= 0) return 'OpenClaw';
      return t('source.local');
    }
    function inferSessionSource(s) {
      var direct = s.agentId || s.agent || s.agentName || '';
      if (direct) return { name: String(direct), kind: 'agent', note: t('source.agentMarked') };
      var tags = Array.isArray(s.tags) ? s.tags.join(' ').toLowerCase() : '';
      var pid = String(s.project || s.cwd || s.id || '').toLowerCase();
      if (pid.indexOf('demo') >= 0) return { name: t('project.demo'), kind: 'demo', note: t('source.demoNote') };
      if (tags.indexOf('jsonl-import') >= 0) return { name: t('source.importedClaude'), kind: 'imported', note: t('source.importedClaudeNote') };
      if (pid.indexOf('codex') >= 0) return { name: 'Codex', kind: 'agent', note: t('source.pathInferred') };
      if (pid.indexOf('claude') >= 0) return { name: 'Claude', kind: 'agent', note: t('source.pathInferred') };
      if (pid.indexOf('cursor') >= 0) return { name: 'Cursor', kind: 'agent', note: t('source.pathInferred') };
      if (pid.indexOf('openclaw') >= 0) return { name: 'OpenClaw', kind: 'agent', note: t('source.pathInferred') };
      return { name: t('source.local'), kind: 'local', note: t('source.unknownAgentNote') };
    }
    function agentAvatarSpec(name) {
      var n = String(name || '').toLowerCase();
      if (n.indexOf('codex') >= 0) return { label: 'Codex', cls: 'codex', image: '/agent-avatars/codex.png' };
      if (n.indexOf('claude') >= 0) return { label: 'Claude', cls: 'claude', image: '/agent-avatars/claude.png' };
      if (n.indexOf('hermes') >= 0) return { label: 'Hermes', cls: 'hermes', image: '/agent-avatars/hermes.png' };
      if (n.indexOf('openclaw') >= 0) return { label: 'OpenClaw', cls: 'openclaw', image: '/agent-avatars/openclaw.png' };
      if (n.indexOf('cursor') >= 0) return { label: 'Cursor', cls: 'cursor' };
      if (n.indexOf('演示') >= 0 || n.indexOf('demo') >= 0) return { label: I18N_LANG === 'zh' ? '演' : 'D', cls: 'unknown' };
      if (n.indexOf('导入') >= 0 || n.indexOf('import') >= 0) return { label: I18N_LANG === 'zh' ? '导' : 'I', cls: 'claude', image: '/agent-avatars/claude.png' };
      if (n.indexOf('本地记录') >= 0 || n.indexOf('local record') >= 0 || n.indexOf('未标记') >= 0 || n.indexOf('unknown') >= 0) return { label: I18N_LANG === 'zh' ? '本' : 'L', cls: 'unknown' };
      return { label: String(name || '?').replace(/\s+/g, '').slice(0, 2).toUpperCase(), cls: 'unknown' };
    }
    function renderAgentAvatar(avatar) {
      var cls = 'agent-avatar ' + esc(avatar.cls || 'unknown') + (avatar.image ? ' has-image' : '');
      if (avatar.image) {
        return '<span class="' + cls + '" data-label="' + esc(avatar.label || '?') + '"><img src="' + esc(avatar.image) + '" alt="' + esc(avatar.label || 'Agent') + ' ' + esc(t('agent.avatarAlt')) + '" loading="lazy" /></span>';
      }
      return '<span class="' + cls + '" data-label="' + esc(avatar.label || '?') + '">' + esc(avatar.label || '?') + '</span>';
    }
    function isDemoSession(s) {
      var raw = String((s && (s.id || s.project || s.cwd || s.title || s.summary)) || '').toLowerCase();
      return raw.indexOf('demo_') >= 0 || raw.indexOf('/tmp/agentmemory-demo') >= 0 || raw.indexOf('agentmemory-demo') >= 0;
    }
    function sessionId(s) {
      return s && s.id !== undefined && s.id !== null ? String(s.id) : '';
    }
    function isValidSession(s) {
      return !!sessionId(s);
    }
    function shortSessionId(s, n) {
      var id = sessionId(s);
      return id ? id.slice(0, n || 8) : '';
    }
    function sessionDisplayName(s) {
      var project = s && s.project ? String(s.project).split('/').pop() : '';
      if (project) return project;
      return shortSessionId(s, 8) || t('dash.unnamedSession');
    }
    function sessionLabel(s) {
      var id = shortSessionId(s, 8);
      var name = sessionDisplayName(s);
      return id ? name + ' (' + id + ')' : name + ' (' + t('ses.noRecordId') + ')';
    }
    function sessionProjectKey(s) {
      var raw = (s && (s.cwd || s.project)) ? String(s.cwd || s.project) : t('project.uncategorized');
      if (raw.indexOf('/tmp/agentmemory-demo') >= 0) return t('project.demo');
      if (raw.indexOf('/Users/szn') === 0) {
        var parts = raw.split('/').filter(Boolean);
        if (parts.length >= 3) return parts.slice(0, 3).join('/');
      }
      return raw.replace(/\/$/, '') || t('project.uncategorized');
    }
    function projectDisplayName(key) {
      var k = String(key || t('project.uncategorized'));
      if (k === 'all') return t('project.all');
      if (k === 'browser') return t('project.browser');
      if (k === '未归类' || k === 'Uncategorized') return t('project.uncategorized');
      if (k === '演示数据' || k === 'Demo data') return t('project.demo');
      var parts = k.split('/').filter(Boolean);
      return parts.length ? parts[parts.length - 1] : k;
    }
    function arrayFromCsv(value) {
      if (Array.isArray(value)) return value.map(function(v) { return String(v || '').trim(); }).filter(Boolean);
      return String(value || '').split(/[,，\s]+/).map(function(v) { return v.trim(); }).filter(Boolean);
    }
    function reviewPayload(item) {
      return (item && item.payload && typeof item.payload === 'object') ? item.payload : {};
    }
    function reviewProject(item) {
      var payload = reviewPayload(item);
      if (payload.projectScope === 'all' || payload.project === 'all') return 'all';
      if (payload.project) return payload.project;
      if (item && item.kind === 'action') return '';
      return (item && item.page && item.page.host) || 'browser';
    }
    function reviewTags(item) {
      var payload = reviewPayload(item);
      return arrayFromCsv(payload.tags).slice(0, 6);
    }
    function isMarkdownPlanText(text) {
      var raw = String(text || '');
      var hasPlanHeading = /^#{1,3}\s+.*(?:计划|Plan)\s*$/im.test(raw);
      var sectionMatches = raw.match(/^#{1,3}\s+(?:Summary|Key Changes|Test Plan|Assumptions|Public API|Implementation|执行步骤|验证命令)\b/img) || [];
      var compact = raw.replace(/\s+/g, ' ');
      var compactPlanSections = [
        /#{1,3}\s+Summary\b/i,
        /#{1,3}\s+Key Changes\b/i,
        /#{1,3}\s+Test Plan\b/i,
        /#{1,3}\s+Assumptions\b/i,
        /#{1,3}\s+Implementation\b/i,
        /#{1,3}\s+执行步骤\b/i,
        /#{1,3}\s+验证命令\b/i
      ].filter(function(pattern) { return pattern.test(compact); }).length;
      var compactPlan = /#{1,3}\s+[^#]{0,160}(?:计划|Plan)/i.test(compact) &&
        (compactPlanSections >= 2 || /#{1,3}\s+Summary\b/i.test(compact));
      return (hasPlanHeading && sectionMatches.length >= 2) || compactPlan;
    }
    function isReviewTextPolluted(text) {
      var trimmed = String(text || '').trim();
      if (!trimmed) return false;
      var lower = trimmed.toLowerCase();
      if (isJsonLikeText(trimmed)) return true;
      if (isMarkdownPlanText(trimmed)) return true;
      if (/please implement this plan/i.test(trimmed)) return true;
      if (/"plan"\s*:/.test(trimmed) && /"status"\s*:/.test(trimmed) && /"step"\s*:/.test(trimmed)) return true;
      if (/"command"\s*:|toolinput|tooloutput|function_id/.test(lower)) return true;
      if (/"(?:cmd|workdir|yield_time_ms|max_output_tokens)"\s*:/.test(lower)) return true;
      if (/\b(tooluseid|tooluse|call_[a-z0-9]+|chunk id|wall time|process exited)\b/i.test(trimmed)) return true;
      if (/^(?:json|state|limit)\s+[\w.-]+/i.test(trimmed)) return true;
      if (/\b(?:namewithowner|headrefname|baserefname|databaseid)\b/i.test(lower)) return true;
      if (/^\s*(?:gh|git|npm|pnpm|yarn|python3?|node|curl)\s+[^\n]*(?:--json|--limit|--workdir|--max-output|--yield-time|status|show|list|run|test|install|build)\b/i.test(trimmed)) return true;
      if (/审查结果\s*\[[Pp]\d+\]/.test(trimmed) && /(?:src|test)\/[^\s]+(?:\s*\(line\s+\d+\))?/.test(trimmed)) return true;
      if (/^src\/[^\s]+/m.test(trimmed) && /\bnpm\s+(test|run|install|build)\b/i.test(trimmed)) return true;
      if (/^\s*(npm|pnpm|yarn)\s+(test|run|install|build)\b/im.test(trimmed)) return true;
      return false;
    }
    function isReviewItemDisplayable(item) {
      if (!item) return false;
      return !isReviewTextPolluted(item.title) && !isReviewTextPolluted(item.content);
    }
    function isActionReviewRenderable(item) {
      if (!item) return false;
      return item.kind === 'action' && isReviewItemDisplayable(item);
    }
    function actionTags(action) {
      return Array.isArray(action && action.tags) ? action.tags.map(String) : [];
    }
    function isGeneratedAction(action) {
      var tags = actionTags(action);
      return (action && action.createdBy === 'todo-extract') ||
        tags.indexOf('todo-extracted') >= 0 ||
        tags.indexOf('action-candidate') >= 0 ||
        !!(action && action.metadata && action.metadata.todoExtraction);
    }
    function isActionRenderable(action) {
      if (!action) return false;
      if (!isGeneratedAction(action)) return true;
      return !isReviewTextPolluted(action.title) && !isReviewTextPolluted(action.description);
    }
    function reviewActionPriority(item) {
      var payload = reviewPayload(item);
      var candidate = payload.actionCandidate && typeof payload.actionCandidate === 'object' ? payload.actionCandidate : {};
      var value = candidate.priority || payload.priority || item.priority || 5;
      var parsed = parseInt(value, 10);
      if (!Number.isFinite(parsed)) parsed = 5;
      return Math.max(1, Math.min(10, parsed));
    }
    function reviewSourceLabel(item) {
      var payload = reviewPayload(item);
      return payload.sourceLabel || payload.provider || (item && item.page && (item.page.typeLabel || item.page.host)) || '浏览器';
    }
    function browserSessionObservations(item) {
      var page = (item && item.page) || {};
      var conversation = (item && item.conversation) || {};
      var turns = Array.isArray(conversation.turns) ? conversation.turns : [];
      var createdAt = (item && (item.createdAt || item.updatedAt)) || new Date().toISOString();
      var observations = [];
      if (page.title || page.url) {
        observations.push({
          id: (item.id || 'browser') + '_page',
          sessionId: 'browser_' + (item.id || ''),
          timestamp: createdAt,
          type: 'web_fetch',
          title: page.title || '浏览器页面',
          subtitle: page.host || page.typeLabel || '浏览器',
          narrative: [page.title, page.url].filter(Boolean).join('\n'),
          facts: [],
          concepts: ['browser'],
          files: [],
          importance: 0.5
        });
      }
      turns.forEach(function(turn, index) {
        var role = turn && turn.role === 'assistant' ? 'AI' : turn && turn.role === 'user' ? '用户' : '对话';
        var text = String((turn && turn.text) || '').trim();
        if (!text) return;
        observations.push({
          id: (item.id || 'browser') + '_turn_' + index,
          sessionId: 'browser_' + (item.id || ''),
          timestamp: createdAt,
          type: 'conversation',
          title: role,
          subtitle: page.title || page.host || '浏览器对话',
          narrative: text,
          facts: [],
          concepts: ['browser', role],
          files: [],
          importance: role === '用户' ? 0.8 : 0.6
        });
      });
      if (item && item.content) {
        observations.push({
          id: (item.id || 'browser') + '_review',
          sessionId: 'browser_' + (item.id || ''),
          timestamp: item.updatedAt || createdAt,
          type: item.kind === 'lesson' ? 'decision' : 'discovery',
          title: item.kind === 'lesson' ? '经验候选' : '同步会话',
          subtitle: item.status === 'approved' ? '已保存' : item.status === 'dismissed' ? '已忽略' : '待审阅',
          narrative: item.content,
          facts: [],
          concepts: ['browser', item.kind === 'lesson' ? 'lesson' : 'session'],
          files: [],
          importance: 0.7
        });
      }
      return observations;
    }
    function browserReviewSessions(items) {
      return (items || []).filter(function(item) {
        var payload = reviewPayload(item);
        return item && item.source === 'browser-extension' && !payload.browserSessionId && item.page && (item.page.type === 'ai-chat' || item.conversation || item.page.url);
      }).map(function(item) {
        var page = item.page || {};
        var payload = reviewPayload(item);
        var provider = (item.conversation && item.conversation.provider) || payload.provider || page.host || '浏览器';
        var obs = browserSessionObservations(item);
        return {
          id: 'browser_' + item.id,
          project: provider || '浏览器',
          cwd: 'browser/' + (page.host || provider || 'web'),
          source: 'browser-extension',
          agentId: provider || '浏览器',
          startedAt: item.createdAt || item.updatedAt || '',
          updatedAt: item.updatedAt || item.createdAt || '',
          endedAt: item.reviewedAt || item.updatedAt || item.createdAt || '',
          status: item.status === 'pending' ? 'active' : 'completed',
          observationCount: obs.length,
          firstPrompt: page.title || item.title || '浏览器对话',
          summary: item.content || '',
          tags: ['browser', page.type || '', item.kind || ''].filter(Boolean),
          embeddedObservations: obs,
          browserPage: page
        };
      });
    }
    function groupSessionsByProject(items) {
      var groups = {};
      (items || []).forEach(function(s) {
        var key = sessionProjectKey(s);
        if (!groups[key]) groups[key] = { key: key, name: projectDisplayName(key), sessions: [], count: 0, latest: '', observations: 0, sources: {}, hasMissingId: false };
        groups[key].sessions.push(s);
        if (!sessionId(s)) groups[key].hasMissingId = true;
        groups[key].count += 1;
        groups[key].observations += s.observationCount || 0;
        var rt = sessionRecordTime(s);
        if (rt > groups[key].latest) groups[key].latest = rt;
        var src = inferSessionSource(s).name || '未标记来源';
        groups[key].sources[src] = (groups[key].sources[src] || 0) + 1;
      });
      return Object.keys(groups).map(function(k) {
        groups[k].sessions.sort(function(a, b) { return (sessionRecordTime(b) || '').localeCompare(sessionRecordTime(a) || ''); });
        return groups[k];
      }).sort(function(a, b) { return (b.latest || '').localeCompare(a.latest || ''); });
    }
    function sessionSourceKey(s) {
      var source = inferSessionSource(s);
      return source.kind + ':' + source.name;
    }
    function sessionSourceGroups(items) {
      var groups = {
        all: { key: 'all', name: '全部会话', count: 0, latest: '', observations: 0, kind: 'all' }
      };
      (items || []).forEach(function(s) {
        var source = inferSessionSource(s);
        var key = sessionSourceKey(s);
        if (!groups[key]) groups[key] = { key: key, name: source.name || '未标记来源', count: 0, latest: '', observations: 0, kind: source.kind || 'source' };
        groups.all.count += 1;
        groups[key].count += 1;
        groups.all.observations += s.observationCount || 0;
        groups[key].observations += s.observationCount || 0;
        var rt = sessionRecordTime(s);
        if (rt > groups.all.latest) groups.all.latest = rt;
        if (rt > groups[key].latest) groups[key].latest = rt;
      });
      return Object.keys(groups).map(function(k) { return groups[k]; }).sort(function(a, b) {
        if (a.key === 'all') return -1;
        if (b.key === 'all') return 1;
        return (b.latest || '').localeCompare(a.latest || '');
      });
    }
    function sessionRecordTime(s) {
      return (s && (s.updatedAt || s.endedAt || s.startedAt)) || '';
    }
    function sessionStatusLabel(status) {
      var map = { active: '历史会话', completed: '历史会话', archived: '历史会话', failed: '历史会话' };
      return map[status] || '历史会话';
    }
    function sessionSourceSummary(s, obsCount) {
      var source = String((s && s.source) || '').indexOf('browser') >= 0 ? '浏览器对话' : String((s && s.source) || '').indexOf('local-') === 0 ? '本地 Agent 会话' : '工作台会话';
      return [
        { label: '来源', value: source },
        { label: '项目', value: projectDisplayName(sessionProjectKey(s)) },
        { label: '记录', value: (obsCount || 0) + ' 条' },
        { label: '时间', value: shortDateTime(sessionRecordTime(s)) || '-' }
      ];
    }
    function statusIconMarkup(status, label) {
      var s = String(status || '').toLowerCase();
      var title = esc(label || sessionStatusLabel(s));
      var cls = s === 'completed' || s === 'done' || s === 'closed' ? 'done'
        : s === 'active' || s === 'running' ? 'active'
        : s === 'blocked' || s === 'failed' || s === 'cancelled' ? s
        : 'pending';
      var icon = '<path d="M5 12l4 4 10-10"/>';
      if (cls === 'active') icon = '<circle cx="12" cy="12" r="7"/><path d="M12 8v4l3 2"/>';
      if (cls === 'pending') icon = '<circle cx="12" cy="12" r="7"/><path d="M12 7v5"/><path d="M12 16h.01"/>';
      if (cls === 'blocked') icon = '<circle cx="12" cy="12" r="7"/><path d="M8 8l8 8"/>';
      if (cls === 'failed' || cls === 'cancelled') icon = '<path d="M7 7l10 10"/><path d="M17 7L7 17"/>';
      return '<span class="badge icon-badge ' + esc(cls) + '" title="' + title + '" aria-label="' + title + '"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icon + '</svg></span>';
    }
    function translateLessonText(text) {
      var t = String(text || '').trim();
      var rules = [
        [/^DO NOT respond to these messages or otherwise consider them in your response unless the user explicitly asks you to\.$/i, '除非用户明确要求，否则不要回应或采纳系统旁路消息。'],
        [/^do not include obvious instructions like "Provide helpful error messages to users", "Write unit tests for all new utilit/i, '不要把显而易见的泛化建议写进经验，例如“提供友好的错误提示”“为所有工具写测试”。'],
        [/^Don't include generic development practices\.$/i, '不要记录过于泛泛的开发常识。'],
        [/^make sure to include the important parts\.$/i, '总结时要保留真正重要的部分，不要只留下空泛结论。'],
        [/^Do not make up information such as "Common Development Tasks", "Tips for Development", "Support and Documentation"/i, '不要编造不存在的章节或功能说明。'],
        [/^Avoid listing every component or file structure that can be easily discovered\.$/i, '避免罗列用户自己很容易查到的组件或文件结构。']
      ];
      for (var i = 0; i < rules.length; i++) {
        if (rules[i][0].test(t)) return rules[i][1];
      }
      return t;
    }
    function memoryCategory(m) {
      var text = ((m && (m.title || m.content || '')) + ' ' + ((m && m.concepts) || []).join(' ')).toLowerCase();
      if (/身份|个人档案|profile|alias|name|自我|生日|出生|本科就读|常用语言|当前重点项目|\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(text)) return '身份档案';
      if (/偏好|preference|喜欢|沟通|协作|working style/.test(text)) return '偏好';
      if (/项目|buddyup|project|产品|创业|ucl|hci/.test(text)) return '项目与目标';
      if (/原则|判断|框架|原则|pattern|workflow|工作流/.test(text)) return '判断框架';
      if (/经历|教育|学校|history|experience/.test(text)) return '经历';
      return memoryTypeLabel(m && m.type);
    }
    function splitCommaList(text) {
      return String(text || '')
        .split(/[、,，]/)
        .map(function(x) { return x.trim().replace(/[。；;]$/, ''); })
        .filter(Boolean);
    }
    function splitSentenceList(text) {
      return String(text || '')
        .split(/[。；;\n]/)
        .map(function(x) { return x.trim(); })
        .filter(Boolean);
    }
    function splitIdentityProfile(content) {
      var text = String(content || '').trim();
      var focusMatch = text.match(/当前重点项目包括[:：]?\s*([^。]+)。?/);
      var communicationMatch = text.match(/沟通偏好[:：]\s*([^。]+)。?/);
      var languageMatch = text.match(/常用语言包括[:：]\s*([^。]+)。?/);
      var educationMatch = text.match(/(本科就读于[^。]+。?)/);
      var intro = text
        .replace(/当前重点项目包括[:：]?\s*[^。]+。?/g, '')
        .replace(/沟通偏好[:：]\s*[^。]+。?/g, '')
        .replace(/常用语言包括[:：]\s*[^。]+。?/g, '')
        .replace(/本科就读于[^。]+。?/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        intro: intro || text,
        education: splitSentenceList(educationMatch && educationMatch[1]),
        focus: splitCommaList(focusMatch && focusMatch[1]),
        communication: splitCommaList(communicationMatch && communicationMatch[1]),
        language: splitCommaList(languageMatch && languageMatch[1])
      };
    }
    function memoryStrength(m) {
      var rawStrength = (m && m.strength) || 0;
      var strength = Math.round(rawStrength <= 1 ? rawStrength * 100 : rawStrength * 10);
      if (strength > 100) strength = 100;
      if (strength < 0) strength = 0;
      return strength;
    }
    function memorySourceKind(m) {
      var concepts = (m && Array.isArray(m.concepts) ? m.concepts : []).join(' ').toLowerCase();
      var project = String((m && m.project) || '').toLowerCase();
      var text = String((m && (m.title || m.content)) || '').toLowerCase();
      if (project === 'browser' || concepts.indexOf('browser-context') >= 0 || text.indexOf('网页记忆线索') >= 0 || text.indexOf('浏览器候选记忆') >= 0) return 'browser';
      if (m && m.sessionIds && m.sessionIds.length) return 'session';
      return 'manual';
    }
    function browserSourceFromMemory(m) {
      var concepts = m && Array.isArray(m.concepts) ? m.concepts : [];
      var source = '';
      concepts.forEach(function(c) {
        var s = String(c || '');
        if (s.indexOf('browser-source:') === 0 && !source) source = s.slice('browser-source:'.length);
      });
      if (source) return source;
      var host = '';
      concepts.forEach(function(c) {
        var s = String(c || '');
        if (s.indexOf('browser-host:') === 0 && !host) host = s.slice('browser-host:'.length);
      });
      return host;
    }
    function browserSourceLabel(source) {
      var labels = { chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini', perplexity: 'Perplexity', grok: 'Grok', deepseek: 'DeepSeek', github: 'GitHub', feishu: '飞书', notion: 'Notion' };
      if (!source) return '浏览器';
      return labels[source] || source.replace(/^www\./, '');
    }
    function memorySourceLabel(m) {
      var kind = memorySourceKind(m);
      if (kind === 'browser') return browserSourceLabel(browserSourceFromMemory(m));
      if (kind === 'session') return '会话';
      return '手动';
    }
    function renderMemoryCard(card) {
      var mem = card.memory || {};
      var cls = card.kind || 'default';
      var html = '<article class="memory-display-card ' + esc(cls) + '">';
      html += '<div class="memory-card-top">';
      html += '<div class="memory-card-title">' + esc(card.title || '未命名记忆') + '</div>';
      html += '<span class="badge ' + (TYPE_BADGES[mem.type] || 'badge-muted') + '">' + esc(card.label || memoryTypeLabel(mem.type)) + '</span>';
      html += '</div>';
      if (card.items && card.items.length) {
        html += '<ul class="memory-card-list">';
        card.items.forEach(function(item) { html += '<li>' + esc(item) + '</li>'; });
        html += '</ul>';
      } else {
        html += '<div class="memory-card-body">' + esc(card.body || '暂无内容') + '</div>';
      }
      if (mem.concepts && mem.concepts.length > 0) {
        html += '<div class="tag-list">';
        mem.concepts.slice(0, 4).forEach(function(c) { html += '<span class="tag">' + esc(c) + '</span>'; });
        html += '</div>';
      }
      html += '<div class="memory-card-footer">';
      html += '<span class="mem-meta-pill icon-badge pending" title="记忆条目" aria-label="记忆条目"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H20"/><path d="M7.5 2H20v20H7.5A2.5 2.5 0 0 1 5 19.5v-17A2.5 2.5 0 0 1 7.5 2z"/></svg></span>';
      html += '<span class="mem-meta-pill" title="来源">' + esc(memorySourceLabel(mem)) + '</span>';
      html += '<div class="memory-card-actions">';
      html += '<button class="btn" style="font-size:10px;padding:3px 8px;" data-action="edit-memory" data-memory-id="' + esc(mem.id || '') + '">编辑</button>';
      html += '<button class="btn btn-danger" style="font-size:10px;padding:3px 8px;" data-action="delete-memory" data-memory-id="' + esc(mem.id || '') + '" data-memory-title="' + esc(card.title || mem.title || '') + '">删除</button>';
      html += '</div></div>';
      html += '</article>';
      return html;
    }
    function memoryDisplayCards(m) {
      var content = (m && (m.content || m.title)) || '';
      if (memoryCategory(m) === '身份档案') {
        var data = splitIdentityProfile(content);
        var cards = [];
        if (data.intro) cards.push({ memory: m, kind: 'identity', label: '身份', title: '基本信息', body: data.intro });
        if (data.education && data.education.length) cards.push({ memory: m, kind: 'history', label: '经历', title: '教育经历', items: data.education });
        if (data.focus && data.focus.length) cards.push({ memory: m, kind: 'project', label: '项目', title: '当前重点', items: data.focus });
        if (data.communication && data.communication.length) cards.push({ memory: m, kind: 'preference', label: '偏好', title: '沟通偏好', items: data.communication });
        if (data.language && data.language.length) cards.push({ memory: m, kind: 'identity', label: '语言', title: '常用表达', items: data.language });
        return cards.length ? cards : [{ memory: m, kind: 'identity', label: memoryTypeLabel(m && m.type), title: (m && m.title) || '身份档案', body: content }];
      }
      var title = ((m && m.title) || '').trim();
      var body = ((m && m.content) || '').trim();
      var sameTitle = title && body && body.indexOf(title) === 0;
      return [{
        memory: m,
        kind: 'default',
        label: memoryTypeLabel(m && m.type),
        title: sameTitle ? truncate(body, 72) : truncate(title || body, 72),
        body: sameTitle ? body.slice(title.length).trim() || body : body
      }];
    }
    function renderIdentityProfileCard(mem) {
      if (!mem) return '';
      var data = splitIdentityProfile(mem.content || mem.title || '');
      var headline = '未命名身份';
      var birth = '';
      var intro = data.intro || '';
      var nameMatch = intro.match(/^([^，。]+?)(?:，|。)/);
      if (nameMatch) headline = nameMatch[1].trim();
      var birthMatch = intro.match(/(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}\s*生?)/);
      if (birthMatch) birth = birthMatch[1].replace(/年|月/g, '-').replace(/日/g, '').replace(/--/g, '-');
      var titleLine = intro.replace(headline, '').replace(/^，/, '').trim();
      if (birth) titleLine = titleLine.replace(birthMatch && birthMatch[0], '').replace(/^，/, '').trim();
      var html = '<section class="card" style="margin-bottom:12px;padding:14px 16px;">';
      html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;">';
      html += '<div style="min-width:220px;flex:1;">';
      html += '<div class="card-title" style="border:0;margin:0;padding:0;">身份档案</div>';
      html += '<div style="font-family:Lora,Georgia,serif;font-size:22px;color:var(--ink);margin-top:8px;line-height:1.25;">' + esc(headline) + '</div>';
      html += '<div style="font-size:13px;color:var(--ink-muted);line-height:1.55;margin-top:7px;max-width:780px;">' + esc(titleLine || intro) + '</div>';
      html += '</div>';
      html += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">';
      if (birth) html += '<span class="mem-meta-pill">生日 ' + esc(birth) + '</span>';
      html += '<span class="badge ' + (TYPE_BADGES[mem.type] || 'badge-muted') + '">' + esc(memoryTypeLabel(mem.type)) + '</span>';
      html += '<button class="btn" style="font-size:11px;padding:4px 10px;" data-action="edit-memory" data-memory-id="' + esc(mem.id || '') + '">编辑</button>';
      html += '</div></div>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-top:12px;">';
      var sections = [
        ['当前重点', data.focus],
        ['沟通偏好', data.communication],
        ['常用语言', data.language]
      ];
      sections.forEach(function(section) {
        var label = section[0];
        var list = section[1] || [];
        html += '<div style="padding:12px;border:1px solid var(--border-light);background:var(--bg-subtle);border-radius:6px;min-height:92px;">';
        html += '<div style="font-size:12px;color:var(--ink-muted);font-weight:700;margin-bottom:8px;">' + esc(label) + '</div>';
        if (list.length) {
          html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
          list.forEach(function(item) { html += '<span class="tag" style="font-size:11px;">' + esc(item) + '</span>'; });
          html += '</div>';
        } else {
          html += '<div style="font-size:12px;color:var(--ink-faint);line-height:1.5;">暂无结构化内容</div>';
        }
        html += '</div>';
      });
      html += '</div>';
      html += '</section>';
      return html;
    }
    function renderIdentityProfileGroup(cards) {
      cards = cards || [];
      if (!cards.length) return '';
      var primary = (cards[0] && cards[0].memory) || {};
      var titleCard = cards.find(function(c) { return c.title === '基本信息'; }) || cards[0];
      var headline = titleCard && titleCard.body ? titleCard.body.split(/[，。]/)[0] : '身份档案';
      var html = '<article class="memory-display-card identity" style="min-height:0;padding:26px !important;">';
      html += '<div style="display:grid;grid-template-columns:minmax(0,1.3fr) auto;gap:22px;align-items:start;">';
      html += '<div style="min-width:0;">';
      html += '<div class="memory-card-title" style="font-size:24px !important;">' + esc(headline || '身份档案') + '</div>';
      if (titleCard && titleCard.body) {
        html += '<div class="memory-card-body" style="margin-top:8px;max-width:760px;">' + esc(truncate(titleCard.body, 150)) + '</div>';
      }
      html += '</div>';
      html += '<div class="memory-card-actions" style="justify-content:flex-end;">';
      html += '<button class="btn" data-action="edit-memory" data-memory-id="' + esc(primary.id || '') + '" data-memory-mode="profile">编辑档案</button>';
      html += '<button class="btn btn-danger" data-action="delete-memory" data-memory-id="' + esc(primary.id || '') + '" data-memory-title="' + esc(primary.title || '身份档案') + '">删除</button>';
      html += '</div></div>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:0;margin-top:20px;border-top:1px solid var(--border);border-left:1px solid var(--border);">';
      cards.forEach(function(card) {
        if (card === titleCard) return;
        html += '<div style="border-right:1px solid var(--border);border-bottom:1px solid var(--border);background:transparent;padding:16px;min-height:150px;">';
        html += '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px;">';
        html += '<div style="font-family:var(--font-ui);font-size:14px;font-weight:650;color:var(--ink);">' + esc(card.title || '信息') + '</div>';
        html += '<span style="font-size:12px;color:var(--ink-muted);">' + esc(card.label || '') + '</span>';
        html += '</div>';
        if (card.items && card.items.length) {
          html += '<ul class="memory-card-list">';
          card.items.forEach(function(item) { html += '<li>' + esc(item) + '</li>'; });
          html += '</ul>';
        } else {
          html += '<div class="memory-card-body">' + esc(card.body || '暂无内容') + '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
      html += '</article>';
      return html;
    }
    function buildAgentMemoryPrompt(mem) {
      var data = splitIdentityProfile((mem && (mem.content || mem.title)) || '');
      var lines = [];
      lines.push('请根据这份用户记忆来优化协作方式：');
      if (data.intro) lines.push('- 用户画像：' + data.intro);
      if (data.focus && data.focus.length) lines.push('- 当前重点：' + data.focus.join('；'));
      if (data.communication && data.communication.length) lines.push('- 沟通偏好：' + data.communication.join('；'));
      if (data.language && data.language.length) lines.push('- 常用表达/风格：' + data.language.join('；'));
      if (data.education && data.education.length) lines.push('- 经历背景：' + data.education.join('；'));
      lines.push('- 协作原则：少暴露用户难以理解的内部概念，把功能解释成清晰的产品流程；能用图标表达的小标签优先用图标；界面和建议都要服务真实使用，而不是只展示系统记录。');
      return lines.join('\n');
    }
    function openAgentPrompt(id) {
      var mem = (state.memories.items || []).find(function(m) { return m.id === id; }) || (state.memories.items || []).find(function(m) { return memoryCategory(m) === '身份档案'; });
      if (!mem) return;
      var prompt = buildAgentMemoryPrompt(mem);
      var modal = document.getElementById('modal');
      var overlay = document.getElementById('modal-overlay');
      modal.innerHTML =
        '<h3>协作提示</h3>' +
        '<p>这些记忆会自动进入 Agent 的理解范围；这里仅保留可复制的提示文本。</p>' +
        '<div class="memory-add-form">' +
        '<label>协作提示<textarea id="agent-memory-prompt" rows="10">' + esc(prompt) + '</textarea></label>' +
        '<div id="agent-prompt-status" class="memory-form-error"></div>' +
        '</div>' +
        '<div class="modal-actions"><button class="btn" data-action="close-modal">关闭</button><button class="btn btn-primary" data-action="copy-agent-prompt">复制提示</button></div>';
      overlay.classList.add('open');
      setTimeout(function() {
        var input = document.getElementById('agent-memory-prompt');
        if (input) input.focus();
      }, 0);
    }
    async function copyAgentPrompt() {
      var text = (document.getElementById('agent-memory-prompt') || {}).value || '';
      var status = document.getElementById('agent-prompt-status');
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          var ta = document.getElementById('agent-memory-prompt');
          if (ta) { ta.select(); document.execCommand('copy'); }
        }
        if (status) {
          status.style.display = 'block';
          status.style.color = 'var(--green)';
          status.textContent = '已复制。';
        }
      } catch (err) {
        if (status) {
          status.style.display = 'block';
          status.style.color = 'var(--red)';
          status.textContent = '复制失败，可以手动选中这段提示。';
        }
      }
    }
    async function copyTextToClipboard(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text || '');
        return;
      }
      var ta = document.createElement('textarea');
      ta.value = text || '';
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    function debounce(fn, ms) {
      var t;
      return function() {
        var args = arguments, ctx = this;
        clearTimeout(t);
        t = setTimeout(function() { fn.apply(ctx, args); }, ms);
      };
    }

    // IME_SAFE_SEARCH_V2
    function bindImeSafeSearch(input, ms, onSearch) {
      var composing = false;
      var justCommitted = false;
      var run = debounce(function(value) { onSearch(value); }, ms);
      input.addEventListener('compositionstart', function() { composing = true; });
      input.addEventListener('compositionend', function() {
        composing = false;
        justCommitted = true;
        onSearch(input.value);
        setTimeout(function() { justCommitted = false; }, 0);
      });
      input.addEventListener('input', function(e) {
        if (composing || e.isComposing) return;
        if (justCommitted) return;
        run(input.value);
      });
    }
    function captureSearchFocus(ids) {
      var a = document.activeElement;
      if (!a || ids.indexOf(a.id) < 0) return null;
      return { id: a.id, start: a.selectionStart, end: a.selectionEnd };
    }
    function restoreSearchFocus(focus) {
      if (!focus) return;
      var el = document.getElementById(focus.id);
      if (!el) return;
      el.focus();
      if (typeof el.setSelectionRange === 'function') {
        try { el.setSelectionRange(focus.start, focus.end); } catch (e) {}
      }
    }

    async function api(path, opts) {
      try {
        var headers = Object.assign({ 'Cache-Control': 'no-cache' }, (opts && opts.headers) || {});
        var fetchOpts = Object.assign({}, opts || {}, { headers: headers });
        var urls = [REST + '/agentmemory/' + path, REST + '/' + path];
        for (var i = 0; i < urls.length; i++) {
          var res = await fetch(urls[i], fetchOpts);
          if (res.ok) return await res.json();
        }
        console.warn('[viewer] API ' + (fetchOpts.method || 'GET') + ' ' + path + ' failed on all route variants');
        return null;
      } catch (err) {
        console.warn('[viewer] API error on ' + path + ':', err);
        return null;
      }
    }
    async function apiGet(path) { return api(path); }
    async function apiPost(path, body) {
      return api(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
    }
    async function apiDelete(path, body) {
      return api(path, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
    }
    async function apiPatch(path, body) {
      return api(path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
    }
    async function loadLocalCodexSessions(limit) {
      var count = limit || 120;
      var result = await apiGet('local-agent-sessions?limit=' + encodeURIComponent(count));
      if (!result) result = await apiGet('local-codex-sessions?limit=' + encodeURIComponent(count));
      return (result && result.sessions) || [];
    }
    async function settledData(label, fallback, loader) {
      try {
        var data = await loader();
        return { label: label, data: data, failed: false };
      } catch (err) {
        console.warn('[viewer] ' + label + ' failed:', err);
        return { label: label, data: fallback, failed: true };
      }
    }
    function renderDataWarnings(warnings, retryAction) {
      if (!warnings || warnings.length === 0) return '';
      var html = '<div class="activity-status-card activity-status-warning"><div class="activity-status-main"><span class="activity-status-dot"></span><span>' + esc(warnings.join('、')) + ' 暂时没读到，已先展示可用数据。</span></div>';
      html += '<button class="btn" data-action="' + esc(retryAction) + '">重试</button></div>';
      return html;
    }
    function mergeSessions(primary, local) {
      var seen = {};
      var out = [];
      (primary || []).forEach(function(s) {
        var id = sessionId(s);
        if (!id) return;
        seen[id] = true;
        out.push(s);
      });
      (local || []).forEach(function(s) {
        var id = sessionId(s).replace(/^codex_local_/, 'codex_');
        if (!sessionId(s)) return;
        if (!seen[id] && !seen[sessionId(s)]) out.push(s);
      });
      return out;
    }

    function normalizeTab(tab) {
      var normalized = String(tab || '').replace(/^#/, '').toLowerCase();
      // 专家模式下,被隐藏视图放行;否则按 TAB_REDIRECTS 折回主三栏。
      if (expertModeEnabled() && EXPERT_TABS.some(function(t) { return t.id === normalized; })) {
        return normalized;
      }
      if (TAB_REDIRECTS[normalized]) return TAB_REDIRECTS[normalized];
      return TAB_IDS.indexOf(normalized) >= 0 ? normalized : 'dashboard';
    }

    function tabFromRoute() {
      try {
        return normalizeTab(decodeURIComponent(window.location.hash.slice(1)));
      } catch (_) {
        return 'dashboard';
      }
    }

    function updateTabRoute(tab, replace) {
      var target = '#' + tab;
      if (window.location.hash === target) return;
      if (replace) {
        history.replaceState(null, '', target);
      } else {
        history.pushState(null, '', target);
      }
    }

    function switchTab(tab, opts) {
      opts = opts || {};
      tab = normalizeTab(tab);
      if (state.activeTab === 'replay' && tab !== 'replay' && typeof stopReplayTimer === 'function') {
        stopReplayTimer();
      }
      if (!opts.skipRoute) {
        updateTabRoute(tab, !!opts.replaceRoute);
      }
      state.activeTab = tab;
      document.querySelectorAll('.tab-bar button').forEach(function(b) {
        var isActive = b.dataset.tab === tab;
        b.classList.toggle('active', isActive);
        if (isActive) {
          b.setAttribute('aria-current', 'page');
        } else {
          b.removeAttribute('aria-current');
        }
      });
      document.querySelectorAll('.view').forEach(function(v) {
        v.classList.toggle('active', v.id === 'view-' + tab);
      });
      if (state.flagsConfig) renderFlagBanners(state.flagsConfig);
      loadTab(tab);
    }

    async function loadTab(tab) {
      switch(tab) {
        case 'dashboard': if (!state.dashboard.loaded) await loadDashboard(); break;
        case 'graph': if (!state.graph.loaded) await loadGraph(); break;
        case 'memories': if (!state.memories.loaded) await loadMemories(); break;
        case 'timeline': if (!state.timeline.loaded) await loadTimeline(); break;
        case 'sessions': if (!state.sessions.loaded) await loadSessions(); break;
        case 'lessons': if (!state.lessons.loaded) await loadLessons(); break;
        case 'actions': if (!state.actions.loaded) await loadActions(); break;
        case 'audit': if (!state.audit.loaded) await loadAudit(); break;
        case 'activity': if (!state.activity.loaded) await loadActivity(); break;
        case 'profile': if (!state.profile.loaded) await loadProfile(); break;
        case 'replay': if (!state.replay.loaded) await loadReplay(); break;
      }
    }

    async function loadDashboard() {
      var el = document.getElementById('view-dashboard');
      el.innerHTML = '<div class="loading">加载总览中...</div>';
      var showDebug = new URLSearchParams(window.location.search).get('debug') === '1';
      try {
        var baseResults = await Promise.all([
          apiGet('health'),
          apiGet('sessions'),
          apiGet('actions'),
          apiGet('review?status=pending&kind=action&limit=200'),
          apiGet('inbox?status=awaiting&limit=50')
        ]);
        state.dashboard.health = baseResults[0];
        state.dashboard.sessions = ((baseResults[1] && baseResults[1].sessions) || []).filter(function(s) { return !isDemoSession(s); });
        state.dashboard.actions = ((baseResults[2] && baseResults[2].actions) || []).filter(isActionRenderable);
        state.dashboard.actionReviews = ((baseResults[3] && baseResults[3].items) || []).filter(isActionReviewRenderable);
        state.dashboard.inboxAwaiting = (baseResults[4] && baseResults[4].items) || [];
        if (showDebug) {
          var debugResults = await Promise.all([
            apiGet('memories?latest=true&limit=500'),
            apiGet('graph/stats'),
            apiGet('audit?limit=5'),
            apiGet('semantic'),
            apiGet('procedural'),
            apiGet('relations'),
            apiGet('lessons'),
            apiGet('delivery-status')
          ]);
          state.dashboard.memories = (debugResults[0] && debugResults[0].memories) || [];
          state.dashboard.graphStats = debugResults[1];
          state.dashboard.recentAudit = (debugResults[2] && debugResults[2].entries) || [];
          state.dashboard.semantic = (debugResults[3] && debugResults[3].facts) || (debugResults[3] && debugResults[3].semantic) || [];
          state.dashboard.procedural = (debugResults[4] && debugResults[4].procedures) || (debugResults[4] && debugResults[4].procedural) || [];
          state.dashboard.relations = (debugResults[5] && debugResults[5].relations) || [];
          state.dashboard.lessons = (debugResults[6] && debugResults[6].lessons) || [];
          state.dashboard.delivery = debugResults[7] || null;
        }
        state.dashboard.loaded = true;
        renderDashboard();
      } catch (err) {
        // Without this catch, any uncaught error in the await Promise.all
        // or the renderDashboard call leaves the dashboard stuck on
        // "Loading dashboard..." forever with no indication to the user
        // (#323). apiGet() already swallows network/HTTP errors and
        // returns null, but renderDashboard can still throw on shape
        // surprises (CSP-blocked event handler binding, undefined fields).
        // Surface the error in the panel + log full detail to console.
        var msg = (err && err.message) ? err.message : String(err);
        console.error('[viewer] loadDashboard failed:', err);
        el.innerHTML =
          '<div class="loading" style="color:var(--accent);">' +
          'Dashboard failed to load: ' + msg +
          '<br><br><span style="font-size:12px;color:var(--ink-muted);">' +
          'Check the browser console for the full error. If you see CSP ' +
          'violations, please open an issue with the AI Todo version ' +
          '(top-right of the viewer) and the violation text.' +
          '</span></div>';
      }
    }

    function deliveryBadgeClass(value) {
      if (value === 'ready') return 'badge-green';
      if (value === 'mostly-ready') return 'badge-yellow';
      return 'badge-muted';
    }
    function deliveryStatusLabel(value) {
      if (value === 'ready') return '已就绪';
      if (value === 'mostly-ready') return '基本可试';
      return '等待准备';
    }
    function publicReleaseLabel(value) {
      if (value === 'ready') return '可发布';
      return '等待证据';
    }
    function renderDeliveryStatusCard(delivery, options) {
      var showDebug = options && options.debug;
      if (!delivery) return '';
      if (delivery.available === false) {
        return '<div class="card" style="margin-bottom:16px;"><div class="card-title">浏览器入口</div><div style="font-size:13px;color:var(--ink-muted);line-height:1.55;">浏览器入口还没有打包。现在可以先在本机加载 <code>browser-extension/</code> 文件夹使用。</div></div>';
      }
      var real = delivery.realSiteValidation || {};
      var passed = Number(real.passedCount || 0);
      var required = Number(real.requiredCount || 4);
      var pct = required > 0 ? Math.round((passed / required) * 100) : 0;
      var external = delivery.externalTesting || 'not-ready';
      var publicState = delivery.publicRelease || 'not-ready';
      var notPassed = Array.isArray(real.notPassed) ? real.notPassed : [];
      var sites = Array.isArray(real.sites) ? real.sites : [];
      var zip = delivery.artifacts && delivery.artifacts.extensionZip ? delivery.artifacts.extensionZip : null;
      var zipLabel = zip && zip.exists ? '插件包已生成' : '插件包未生成';
      var version = delivery.extension && delivery.extension.version ? delivery.extension.version : '0.1.0';
      var next = notPassed.length ? notPassed.join('、') : '真实站点已齐';
      var html = '<div class="card" style="margin-bottom:16px;">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;">';
      html += '<div><div class="card-title" style="margin-bottom:4px;">浏览器会话同步</div><div style="font-size:13px;color:var(--ink-muted);line-height:1.5;">打开 AI 会话页后自动同步，后续整理都在工作台完成。</div></div>';
      html += '<span class="badge ' + deliveryBadgeClass(external) + '">' + esc(zipLabel) + '</span>';
      html += '</div>';
      html += '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--border-light);border-bottom:1px solid var(--border-light);margin-bottom:12px;">';
      html += '<div style="font-size:12px;color:var(--ink-muted);line-height:1.45;">' + esc(version) + ' · 支持 ChatGPT / Claude / Gemini 等 AI 会话页 · 真实页面证据 ' + passed + '/' + required + '</div>';
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;"><a class="btn btn-primary" href="/artifacts/agent-memory-lab-extension.zip" target="_blank" rel="noopener">下载插件</a><a class="btn" href="#sessions">查看会话</a></div>';
      html += '</div>';
      if (!showDebug) {
        html += '<div style="font-size:12px;color:var(--ink-faint);line-height:1.45;">插件界面只显示同步状态，不在浏览器里做内容挑选。</div></div>';
        return html;
      }
      html += '<div class="stats-grid" style="margin-bottom:12px;">';
      html += '<div class="stat-card"><div class="label">插件自检</div><div class="value" style="font-size:22px;">' + esc(deliveryStatusLabel(delivery.localDemo)) + '</div><div class="sub">排错用预览页</div></div>';
      html += '<div class="stat-card"><div class="label">真实 AI 证据</div><div class="value" style="font-size:24px;">' + passed + '/' + required + '</div><div class="sub">公开发布必需</div></div>';
      html += '<div class="stat-card"><div class="label">公开发布</div><div class="value" style="font-size:22px;">' + esc(publicReleaseLabel(publicState)) + '</div><div class="sub">需真实站点通过</div></div>';
      html += '</div>';
      html += '<div style="border:1px solid var(--line);background:var(--surface-soft);padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--ink-secondary);line-height:1.45;">真实 AI 页面通过证据必须包含 <code>turnCount &gt; 0</code> 和会话区域 selector；插件只同步网页 AI 会话，不读取选中文本或输入草稿。</div>';
      html += '<div class="gauge" style="margin-bottom:10px;"><span class="gauge-label">AI 页面</span><div class="gauge-bar"><div class="gauge-fill" style="width:' + pct + '%;background:' + (pct >= 100 ? 'var(--green)' : 'var(--yellow)') + '"></div></div><span class="gauge-value">' + pct + '%</span></div>';
      if (sites.length) {
        html += '<div class="memory-card-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-bottom:12px;">';
        sites.forEach(function(site) {
          var status = site.status || 'missing';
          var badge = status === 'passed' ? 'badge-green' : status === 'needs-fix' ? 'badge-yellow' : 'badge-muted';
          var label = status === 'passed' ? '已通过' : status === 'needs-fix' ? '待修复' : '待验收';
          var missing = Array.isArray(site.missing) && site.missing.length ? site.missing.join('、') : (status === 'passed' ? '证据完整' : '缺真实页面证据');
          html += '<div class="stat-card" style="padding:10px;">';
          html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;"><div class="label">' + esc(site.product || 'AI') + '</div><span class="badge ' + badge + '">' + label + '</span></div>';
          html += '<div class="sub" style="line-height:1.35;">' + esc(missing) + '</div>';
          if (site.file) html += '<div class="sub" style="margin-top:6px;overflow-wrap:anywhere;">' + esc(site.file) + '</div>';
          html += '</div>';
        });
        html += '</div>';
      }
      html += '<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;">';
      html += '<div style="font-size:12px;color:var(--ink-muted);">下一步验收：' + esc(next) + '</div>';
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;"><a class="btn" href="/docs/external-tester-guide-cn.md" target="_blank" rel="noopener">外部试用指南</a><a class="btn" href="/docs/browser-extension-ai-site-test-cards-cn.md" target="_blank" rel="noopener">真实页面验收</a></div>';
      html += '</div></div>';
      return html;
    }
    function renderDashboard() {
      var el = document.getElementById('view-dashboard');
      var d = state.dashboard;
      var showDebug = new URLSearchParams(window.location.search).get('debug') === '1';
      var h = d.health || {};
      var snap = h.health || {};
      var healthStatus = h.status || 'unknown';
      var dotClass = healthStatus === 'healthy' ? 'healthy' : healthStatus === 'degraded' ? 'degraded' : healthStatus === 'critical' ? 'critical' : '';
      var activeSessions = d.sessions.filter(function(s) { return s.status === 'active'; }).length;
      var gs = d.graphStats || {};
      var nodeCount = gs.totalNodes !== undefined ? gs.totalNodes : (gs.nodes !== undefined ? gs.nodes : (gs.nodeCount || 0));
      var edgeCount = gs.totalEdges !== undefined ? gs.totalEdges : (gs.edges !== undefined ? gs.edges : (gs.edgeCount || 0));
      var fMetrics = h.functionMetrics || [];
      var cb = h.circuitBreaker || null;
      var workers = snap.workers || [];
      var actions = (d.actions || []).filter(isActionRenderable);
      var actionReviews = (d.actionReviews || []).filter(isActionReviewRenderable);
      var awaitingReplies = (d.inboxAwaiting || []).filter(function(i) { return i && i.kind === 'question'; });
      var followUps = actions.filter(function(a) { return a.status === 'pending' || a.status === 'blocked'; });

      var html = '';

      // First-run hero: empty dashboard = guided next step
      if (d.sessions.length === 0) {
        html += '<div class="card" style="margin-bottom:14px;padding:24px 28px;background:var(--bg-subtle);border-left:3px solid var(--accent);">' +
          '<div style="font-family:var(--font-ui);font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:8px;">' + t('dash.firstRun.kicker') + '</div>' +
          '<div style="font-family:var(--font-display,Lora,Georgia,serif);font-size:22px;font-weight:700;color:var(--ink);margin-bottom:8px;">' + t('dash.firstRun.title') + '</div>' +
          '<div style="font-size:13px;color:var(--ink-muted);margin-bottom:12px;line-height:1.5;max-width:640px;">' + t('dash.firstRun.body') + '</div>' +
          '<pre style="display:inline-block;margin:0;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;color:var(--ink);">node dist/cli.mjs demo</pre>' +
          '<div style="margin-top:10px;"><a class="empty-link" href="https://github.com/MaimoryLab/agentmemory-lab#quick-start" target="_blank" rel="noopener" style="font-size:12px;">' + t('dash.firstRun.link') + '</a></div>' +
          '</div>';
      }
      html += '<div class="stats-grid">';
      var latestSessionTime = d.sessions.length ? shortDateTime(sessionRecordTime(d.sessions.slice().sort(function(a, b) { return (sessionRecordTime(b) || '').localeCompare(sessionRecordTime(a) || ''); })[0])) : t('dash.noRecord');
      html += '<div class="stat-card"><div class="label">' + t('dash.stat.sessions') + '</div><div class="value">' + d.sessions.length + '</div><div class="sub">' + t('dash.stat.recent') + ' ' + esc(latestSessionTime) + '</div></div>';
      html += '<div class="stat-card"><div class="label">' + t('dash.stat.todos') + '</div><div class="value">' + actions.length + '</div><div class="sub"><a href="#actions">' + t('dash.stat.openWorkbench') + '</a></div></div>';
      html += '<div class="stat-card"><div class="label">' + t('act.metric.waiting') + '</div><div class="value">' + awaitingReplies.length + '</div><div class="sub"><a href="#actions">' + t('dash.stat.replyQueue') + '</a></div></div>';
      html += '<div class="stat-card"><div class="label">' + t('act.metric.review') + '</div><div class="value">' + actionReviews.length + '</div><div class="sub"><a href="#actions">' + t('dash.stat.actionCandidates') + '</a></div></div>';
      html += '<div class="stat-card"><div class="label">' + t('act.metric.followUp') + '</div><div class="value">' + followUps.length + '</div><div class="sub"><a href="#actions">' + t('dash.stat.pendingActions') + '</a></div></div>';
      var lessonCount = (d.lessons || []).length;
      if (showDebug) {
        html += '<div class="stat-card"><div class="label">' + t('dash.stat.memories') + '</div><div class="value">' + d.memories.length + '</div><div class="sub">' + t('dash.stat.latestVersion') + '</div></div>';
        html += '<div class="stat-card"><div class="label">' + t('dash.stat.lessons') + '</div><div class="value">' + lessonCount + '</div><div class="sub">' + t('dash.stat.lessonsSub') + '</div></div>';
      }
      if (showDebug && (nodeCount > 0 || edgeCount > 0)) {
        html += '<div class="stat-card"><div class="label">' + t('dash.stat.graphNodes') + '</div><div class="value">' + nodeCount + '</div><div class="sub">' + t('dash.stat.edges') + ' ' + edgeCount + '</div></div>';
      }
      if (showDebug) {
        html += '<div class="stat-card"><div class="label">' + t('dash.stat.status') + '</div><div class="value"><div class="health-bar"><span class="health-dot ' + dotClass + '"></span> ' + esc(healthStatus) + '</div></div>';
        html += '<div class="sub">' + esc(snap.connectionState || 'unknown') + '</div></div>';
      }
      if (showDebug) {
        var totalCalls = fMetrics.reduce(function(a, m) { return a + (m.totalCalls || 0); }, 0);
        html += '<div class="stat-card"><div class="label">' + t('dash.stat.toolCalls') + '</div><div class="value">' + totalCalls + '</div><div class="sub">' + t('dash.stat.tracking') + ' ' + fMetrics.length + ' ' + t('dash.stat.functions') + '</div></div>';
      }
      if (showDebug && cb) {
        var cbClass = cb.state === 'closed' ? 'cb-closed' : cb.state === 'open' ? 'cb-open' : 'cb-half-open';
        html += '<div class="stat-card"><div class="label">' + t('dash.stat.circuitBreaker') + '</div><div class="value"><span class="cb-indicator ' + cbClass + '">' + esc(cb.state) + '</span></div>';
        html += '<div class="sub">' + t('dash.stat.failed') + ' ' + (cb.failures || 0) + ' ' + t('dash.stat.times') + '</div></div>';
      }
      var totalObs = d.sessions.reduce(function(a, s) { return a + (s.observationCount || 0); }, 0);
      var tokenBudget = parseInt(new URLSearchParams(window.location.search).get('tokenBudget') || '2000', 10) || 2000;
      var estFull = totalObs * 80;
      var estInjected = d.sessions.length * tokenBudget;
      var savings = estFull > 0 ? Math.round((1 - estInjected / Math.max(estFull, 1)) * 100) : 0;
      if (savings < 0) savings = 0;
      html += '</div>';

      html += renderDeliveryStatusCard(d.delivery, { debug: showDebug });

      if (showDebug && (snap.memory || snap.cpu)) {
        html += '<div class="card" style="margin-bottom:16px"><div class="card-title">' + t('dash.systemResources') + '</div>';
        if (snap.memory) {
          var heapUsed = Math.round((snap.memory.heapUsed || 0) / 1024 / 1024);
          var heapTotal = Math.round((snap.memory.heapTotal || 0) / 1024 / 1024);
          var rss = Math.round((snap.memory.rss || 0) / 1024 / 1024);
          var heapPct = heapTotal > 0 ? Math.round((heapUsed / heapTotal) * 100) : 0;
          var rssAboveFloor = rss >= 512;
          var heapColor = (heapPct > 80 && rssAboveFloor) ? 'var(--red)' : (heapPct > 60 && rssAboveFloor) ? 'var(--yellow)' : 'var(--green)';
          html += '<div class="gauge"><span class="gauge-label">Heap</span><div class="gauge-bar"><div class="gauge-fill" style="width:' + heapPct + '%;background:' + heapColor + '"></div></div><span class="gauge-value">' + heapUsed + ' / ' + heapTotal + ' MB</span></div>';
          html += '<div class="gauge"><span class="gauge-label">RSS</span><div class="gauge-bar"><div class="gauge-fill" style="width:' + Math.min(100, Math.round(rss / 512 * 100)) + '%;background:var(--blue)"></div></div><span class="gauge-value">' + rss + ' MB</span></div>';
          if (snap.memory.external) {
            var ext = Math.round(snap.memory.external / 1024 / 1024);
            html += '<div class="gauge"><span class="gauge-label">External</span><div class="gauge-bar"><div class="gauge-fill" style="width:' + Math.min(100, Math.round(ext / 128 * 100)) + '%;background:var(--purple)"></div></div><span class="gauge-value">' + ext + ' MB</span></div>';
          }
        }
        if (snap.cpu) {
          var cpuPct = snap.cpu.percent || 0;
          var cpuColor = cpuPct > 80 ? 'var(--red)' : cpuPct > 50 ? 'var(--yellow)' : 'var(--green)';
          html += '<div class="gauge"><span class="gauge-label">CPU</span><div class="gauge-bar"><div class="gauge-fill" style="width:' + Math.min(100, cpuPct) + '%;background:' + cpuColor + '"></div></div><span class="gauge-value">' + cpuPct.toFixed(1) + '%</span></div>';
        }
        if (snap.eventLoopLagMs !== undefined) {
          var lag = snap.eventLoopLagMs;
          var lagColor = lag > 100 ? 'var(--red)' : lag > 20 ? 'var(--yellow)' : 'var(--green)';
          html += '<div class="gauge"><span class="gauge-label">Event Loop</span><div class="gauge-bar"><div class="gauge-fill" style="width:' + Math.min(100, lag) + '%;background:' + lagColor + '"></div></div><span class="gauge-value">' + lag.toFixed(1) + ' ms</span></div>';
        }
        if (snap.uptimeSeconds) {
          var mins = Math.floor(snap.uptimeSeconds / 60);
          var hrs = Math.floor(mins / 60);
          var upStr = hrs > 0 ? hrs + 'h ' + (mins % 60) + 'm' : mins + 'm';
          html += '<div style="font-size:10px;color:var(--ink-faint);margin-top:6px;font-family:var(--font-mono);letter-spacing:0.04em;">UPTIME: ' + upStr + '</div>';
        }
        html += '</div>';
      }

      if (showDebug && snap.alerts && snap.alerts.length > 0) {
        html += '<div class="card" style="margin-bottom:16px;border-color:var(--accent);border-width:2px;"><div class="card-title" style="color:var(--accent);border-bottom-color:var(--accent);">' + t('dash.alerts') + ' (' + snap.alerts.length + ')</div>';
        snap.alerts.forEach(function(al) {
          html += '<div style="font-size:12px;color:var(--accent);padding:4px 0;border-bottom:1px solid var(--border-light);font-family:var(--font-ui);">' + esc(al) + '</div>';
        });
        html += '</div>';
      }

      if (showDebug && snap.notes && snap.notes.length > 0) {
        html += '<div class="card" style="margin-bottom:16px;"><div class="card-title" style="color:var(--ink-muted);">' + t('dash.notes') + ' (' + snap.notes.length + ')</div>';
        snap.notes.forEach(function(n) {
          html += '<div style="font-size:12px;color:var(--ink-muted);padding:4px 0;border-bottom:1px solid var(--border-light);font-family:var(--font-ui);">' + esc(n) + '</div>';
        });
        html += '</div>';
      }

      html += '<div class="card"><div class="card-title">' + t('dash.recentSessions') + '</div>';
      if (d.sessions.length === 0) {
        html += '<div class="empty-state"><p>' + t('dash.emptySessions') + '</p></div>';
      } else {
        var recentGroups = groupSessionsByProject(d.sessions).slice(0, 5);
        html += '<div class="folder-grid">';
        recentGroups.forEach(function(g) {
          var latest = g.sessions && g.sessions[0];
          var latestId = sessionId(latest);
          var cardName = g.hasMissingId ? t('dash.unnamedSession') : g.name;
          html += '<button type="button" class="folder-card" data-action="open-session-group" data-session-id="' + esc(latestId || '') + '" title="' + esc(g.key) + '" aria-label="' + t('dash.openLatestSyncOf') + ' ' + esc(cardName) + '">';
          html += '<div class="folder-title">' + esc(cardName) + '</div>';
          html += '<div class="folder-path">' + esc(g.key) + '</div>';
          html += '<div class="folder-meta">';
          html += '<span><svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/></svg>' + g.count + ' ' + t('dash.syncs') + '</span>';
          html += '<span><svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v20H7.5A2.5 2.5 0 0 1 5 19.5z"/><path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H19"/></svg>' + g.observations + ' ' + t('dash.records') + '</span>';
          html += '</div>';
          html += '<div class="folder-time">' + t('dash.lastSync') + ' ' + esc(shortDateTime(g.latest)) + '</div>';
          html += '</button>';
        });
        html += '</div>';
      }
      html += '</div>';

      if (showDebug && fMetrics.length > 0) {
        var sorted = fMetrics.slice().sort(function(a, b) { return (b.totalCalls || 0) - (a.totalCalls || 0); });
        html += '<div class="card" style="margin-top:16px"><div class="card-title">' + t('dash.functionMetrics') + '</div>';
        html += '<table class="metric-table"><tr><th>Function</th><th style="text-align:right">Calls</th><th style="text-align:right">Success</th><th style="text-align:right">Fail</th><th style="text-align:right">Avg Latency</th><th style="text-align:right">Quality</th></tr>';
        sorted.forEach(function(m) {
          var successRate = m.totalCalls > 0 ? Math.round((m.successCount / m.totalCalls) * 100) : 0;
          var rateColor = successRate >= 95 ? 'var(--green)' : successRate >= 80 ? 'var(--yellow)' : 'var(--red)';
          var latencyColor = m.avgLatencyMs > 1000 ? 'var(--red)' : m.avgLatencyMs > 200 ? 'var(--yellow)' : 'var(--green)';
          html += '<tr>';
          html += '<td class="metric-fn">' + esc(m.functionId) + '</td>';
          html += '<td class="metric-num">' + m.totalCalls + '</td>';
          html += '<td class="metric-num" style="color:' + rateColor + '">' + m.successCount + ' (' + successRate + '%)</td>';
          html += '<td class="metric-num" style="color:' + (m.failureCount > 0 ? 'var(--red)' : 'var(--ink-faint)') + '">' + m.failureCount + '</td>';
          html += '<td class="metric-num" style="color:' + latencyColor + '">' + Math.round(m.avgLatencyMs) + ' ms</td>';
          html += '<td class="metric-num">' + (m.avgQualityScore > 0 ? m.avgQualityScore.toFixed(2) : '-') + '</td>';
          html += '</tr>';
        });
        html += '</table></div>';
      }

      if (showDebug && workers.length > 0) {
        html += '<div class="card" style="margin-top:16px"><div class="card-title">' + t('dash.workers') + '</div>';
        workers.forEach(function(w) {
          var statusClass = w.status === 'running' ? 'running' : w.status === 'starting' ? 'starting' : 'stopped';
          html += '<div class="worker-row"><span class="worker-dot ' + statusClass + '"></span>';
          html += '<span style="color:var(--ink);font-weight:600;font-family:var(--font-ui);font-size:12px;">' + esc(w.name) + '</span>';
          html += '<span class="badge ' + (w.status === 'running' ? 'badge-green' : 'badge-muted') + '">' + esc(w.status) + '</span>';
          html += '<span style="font-size:10px;color:var(--ink-faint);font-family:var(--font-mono);">' + esc(w.id) + '</span></div>';
        });
        html += '</div>';
      }

      if (showDebug && cb && cb.state !== 'closed') {
        html += '<div class="card" style="margin-top:16px;border-color:var(--accent);border-width:2px;"><div class="card-title" style="color:var(--accent);">' + t('dash.circuitBreakerDetail') + '</div>';
        html += '<div class="detail-row"><div class="dl">State</div><div class="dv"><span class="cb-indicator ' + (cb.state === 'open' ? 'cb-open' : 'cb-half-open') + '">' + esc(cb.state) + '</span></div></div>';
        html += '<div class="detail-row"><div class="dl">Failures</div><div class="dv" style="color:var(--accent);font-family:var(--font-mono);">' + (cb.failures || 0) + '</div></div>';
        if (cb.lastFailureAt) html += '<div class="detail-row"><div class="dl">Last Failure</div><div class="dv" style="font-family:var(--font-mono);font-size:12px;">' + esc(formatTime(cb.lastFailureAt)) + '</div></div>';
        if (cb.openedAt) html += '<div class="detail-row"><div class="dl">Opened At</div><div class="dv" style="font-family:var(--font-mono);font-size:12px;">' + esc(formatTime(cb.openedAt)) + '</div></div>';
        html += '</div>';
      }

      if (showDebug) {
      var semFacts = d.semantic || [];
      var procItems = d.procedural || [];
      var relItems = d.relations || [];

      html += '<hr class="section-rule">';
      html += '<div class="two-col">';

      html += '<div class="card"><div class="card-title">' + t('dash.semanticMemory') + '</div>';
      if (semFacts.length === 0) {
        html += '<div style="font-size:13px;color:var(--ink-faint);font-style:italic;">' + t('dash.emptySemantic') + '</div>';
      } else {
          semFacts.slice(0, 5).forEach(function(f) {
            var conf = typeof f.confidence === 'number' ? Math.round(f.confidence * 100) : null;
            var str = typeof f.strength === 'number' ? Math.round(f.strength * 100) : null;
            var barColor = (str || 0) > 70 ? 'var(--green)' : (str || 0) > 40 ? 'var(--yellow)' : 'var(--red)';
            html += '<div class="memory-fact">';
            html += '<span style="color:var(--ink);">' + esc(f.fact || f.content || f.title || 'Fact') + '</span>';
            html += '<span style="display:flex;align-items:center;gap:6px;">';
            if (str !== null) html += '<span class="strength-bar" style="width:40px;"><span class="fill" style="width:' + str + '%;background:' + barColor + '"></span></span>';
            if (conf !== null) html += '<span style="font-size:10px;font-family:var(--font-mono);color:var(--ink-faint);">' + conf + '%</span>';
            html += '</span></div>';
          });
        }
        html += '</div>';

        html += '<div class="card"><div class="card-title">' + t('dash.proceduralMemory') + '</div>';
      if (procItems.length === 0) {
        html += '<div style="font-size:13px;color:var(--ink-faint);font-style:italic;">' + t('dash.emptyProcedural') + '</div>';
      } else {
          procItems.slice(0, 5).forEach(function(p) {
            html += '<div class="procedure-item">';
            html += '<div style="font-weight:600;color:var(--ink);font-family:var(--font-display);font-size:13px;">' + esc(p.name || p.title || 'Procedure') + '</div>';
            if (p.trigger || p.triggerCondition) html += '<div style="font-size:11px;color:var(--ink-faint);font-family:var(--font-mono);margin-top:2px;">Trigger: ' + esc(p.trigger || p.triggerCondition) + '</div>';
            if (p.frequency) html += '<div style="font-size:11px;color:var(--ink-faint);margin-top:2px;">Freq: ' + p.frequency + '</div>';
            if (p.steps && p.steps.length > 0) {
              html += '<ol class="procedure-steps">';
              p.steps.slice(0, 4).forEach(function(s) { html += '<li>' + esc(typeof s === 'string' ? s : s.description || s.action || JSON.stringify(s)) + '</li>'; });
              if (p.steps.length > 4) html += '<li style="color:var(--ink-faint);font-style:italic;">+ ' + (p.steps.length - 4) + ' more...</li>';
              html += '</ol>';
            }
            html += '</div>';
          });
        }
      html += '</div>';

      html += '</div>';

      html += '<div class="card" style="margin-top:16px;"><div class="card-title">' + t('dash.consolidationStatus') + '</div>';
      html += '<div class="consolidation-row"><span class="cl">Semantic facts</span><span class="cv">' + semFacts.length + '</span></div>';
      html += '<div class="consolidation-row"><span class="cl">Procedures</span><span class="cv">' + procItems.length + '</span></div>';
      html += '<div class="consolidation-row"><span class="cl">Relations</span><span class="cv">' + relItems.length + '</span></div>';
      html += '</div>';

      if (relItems.length > 0) {
        html += '<div class="card" style="margin-top:16px;"><div class="card-title">' + t('dash.memoryRelations') + '</div>';
        relItems.slice(0, 8).forEach(function(r) {
          var relType = r.type || r.relationType || 'related';
          var badgeClass = relType === 'supersedes' ? 'badge-red' : relType === 'extends' ? 'badge-green' : relType === 'contradicts' ? 'badge-yellow' : 'badge-muted';
          html += '<div style="padding:4px 0;border-bottom:1px solid var(--border-light);font-size:12px;display:flex;align-items:center;gap:6px;">';
          html += '<span style="font-family:var(--font-mono);color:var(--blue);font-size:11px;">' + esc(truncate(r.sourceId || r.fromId || '', 8)) + '</span>';
          html += '<span class="badge ' + badgeClass + '">' + esc(relType) + '</span>';
          html += '<span style="font-family:var(--font-mono);color:var(--blue);font-size:11px;">' + esc(truncate(r.targetId || r.toId || '', 8)) + '</span>';
          html += '</div>';
        });
        html += '</div>';
      }
      }

      el.innerHTML = html;
    }

    var dashboardTimer = null;
    function refreshDashboard() {
      state.dashboard.loaded = false;
      loadDashboard();
    }
    function isViewingSessionDetail() {
      return state.activeTab === 'sessions' && !!state.sessions.selectedId;
    }
    function shouldDeferSessionsRefresh(reason) {
      return isViewingSessionDetail() && ['timer', 'poll', 'ws', 'visibility'].indexOf(reason || '') >= 0;
    }
    function sessionStaleNoticeMarkup() {
      if (!state.sessions.stale || !state.sessions.selectedId) return '';
      return '<div class="activity-status-card activity-status-warning" style="margin-bottom:12px;"><div class="activity-status-main"><span class="activity-status-dot"></span><span>有新记录，当前详情暂未自动刷新。</span></div><button class="btn btn-primary" data-action="refresh-sessions">刷新会话</button></div>';
    }
    function renderSessionsStaleNotice() {
      var host = document.getElementById('sessions-stale-notice');
      if (host) host.innerHTML = sessionStaleNoticeMarkup();
    }
    function markSessionsStale() {
      state.sessions.stale = true;
      if (state.activeTab === 'sessions') renderSessionsStaleNotice();
    }
    function markActionsStale(message) {
      state.actions.stale = true;
      if (message) state.actions.extractMessage = message;
      if (state.activeTab === 'actions' && !actionsScrolledAway()) renderActions();
    }
    function refreshActiveTab(reason) {
      reason = reason || 'manual';
      switch (state.activeTab) {
        case 'dashboard': state.dashboard.loaded = false; loadDashboard(); break;
        case 'memories': state.memories.loaded = false; loadMemories(); break;
        case 'sessions':
          if (shouldDeferSessionsRefresh(reason)) {
            markSessionsStale();
          } else {
            state.sessions.loaded = false;
            loadSessions({ showLoading: reason === 'manual', reason: reason });
          }
          break;
        case 'lessons': state.lessons.loaded = false; loadLessons(); break;
        case 'actions':
          if (reason === 'manual') {
            state.actions.loaded = false;
            loadActions({ generate: false });
          } else {
            markActionsStale('有新会话记录，待办暂未自动刷新。');
          }
          break;
        case 'activity': state.activity.loaded = false; loadActivity(); break;
      }
    }
    function markMemoryViewsStale() {
      state.dashboard.loaded = false;
      state.memories.loaded = false;
      state.sessions.loaded = false;
      state.lessons.loaded = false;
      state.actions.loaded = false;
      state.activity.loaded = false;
    }
    function saveDashboardRefreshPrefs() {
      try {
        localStorage.setItem('viewer_dashboard_refresh_enabled', state.dashboardRefresh.enabled ? '1' : '0');
        localStorage.setItem('viewer_dashboard_refresh_interval', String(state.dashboardRefresh.intervalMs));
      } catch {}
    }
    function loadDashboardRefreshPrefs() {
      try {
        var enabled = localStorage.getItem('viewer_dashboard_refresh_enabled');
        var interval = parseInt(localStorage.getItem('viewer_dashboard_refresh_interval') || '', 10);
        if (enabled === '0') state.dashboardRefresh.enabled = false;
        if (!Number.isNaN(interval) && interval >= 10000 && interval <= 120000) state.dashboardRefresh.intervalMs = interval;
      } catch {}
    }
    function startDashboardAutoRefresh() {
      if (dashboardTimer) clearInterval(dashboardTimer);
      if (!state.dashboardRefresh.enabled) return;
      dashboardTimer = setInterval(function() {
        if (pollTimer) return;
        if (state.activeTab === 'dashboard') refreshActiveTab('timer');
      }, state.dashboardRefresh.intervalMs || 30000);
    }

    var graphSim = { nodes: [], edges: [], running: false, canvas: null, ctx: null, raf: null, panX: 0, panY: 0, zoom: 1, dragNode: null, mouseX: 0, mouseY: 0, tickCount: 0, quietTicks: 0 };
    function wakeGraphSim() {
      graphSim.quietTicks = 0;
      if (graphSim.running && !graphSim.raf) {
        graphSim.raf = requestAnimationFrame(runSimulation);
      }
    }

    async function loadGraph() {
      var el = document.getElementById('view-graph');
      el.innerHTML = '<div class="loading">检查关系图数据中...</div>';

      var results = await Promise.all([
        apiPost('graph/query', {}),
        apiGet('graph/stats')
      ]);
      var queryResult = results[0] || { nodes: [], edges: [] };
      state.graph.nodes = queryResult.nodes || [];
      state.graph.edges = queryResult.edges || [];
      state.graph.stats = results[1] || {};

      if (state.graph.nodes.length === 0) {
        state.graph.loaded = true;
        el.innerHTML =
          '<div class="empty-state" style="max-width:720px;margin:40px auto;">' +
          '<div class="empty-icon">&#128376;</div>' +
          '<div class="empty-title">关系图暂时隐藏</div>' +
          '<div class="empty-lead">当前没有可展示的节点和连线，所以侧边栏不再显示这个入口。等系统真的提取出关系后，再把关系图作为可用功能放回来。</div>' +
          '<pre class="empty-cmd">需要关系图时：配置 LLM key，并开启 GRAPH_EXTRACTION_ENABLED=true 后重启。</pre>' +
          '</div>';
        return;
      }

      el.innerHTML = '<div class="graph-container"><div class="graph-canvas-wrap"><canvas id="graph-canvas"></canvas><div class="graph-controls"><button title="放大" data-action="zoom-graph" data-dir="1">+</button><button title="缩小" data-action="zoom-graph" data-dir="-1">&minus;</button><div class="ctrl-divider"></div><button title="回到中心" data-action="recenter-graph">⌖</button></div><div class="graph-tooltip" id="graph-tooltip"></div></div><div class="graph-sidebar" id="graph-sidebar"></div></div>';
      state.graph.loaded = true;
      var types = {};
      state.graph.nodes.forEach(function(n) { types[n.type] = true; });
      state.graph.filters = types;

      renderGraphSidebar();
      initGraph();
    }

    var NODE_SHAPES = {
      file: 'rect', function: 'circle', concept: 'circle', error: 'diamond',
      decision: 'diamond', pattern: 'circle', library: 'hexagon', person: 'circle'
    };
    var graphSearchTerm = '';

    function renderGraphSidebar() {
      var sb = document.getElementById('graph-sidebar');
      if (!sb) return;
      var gs = state.graph.stats || {};
      var nodeCount = gs.totalNodes !== undefined ? gs.totalNodes : (gs.nodes !== undefined ? gs.nodes : (gs.nodeCount || state.graph.nodes.length));
      var edgeCount = gs.totalEdges !== undefined ? gs.totalEdges : (gs.edges !== undefined ? gs.edges : (gs.edgeCount || state.graph.edges.length));

      var html = '<input type="text" class="graph-search" id="graph-search" placeholder="搜索节点...">';

      html += '<h3 style="margin-top:16px;font-size:10px;text-transform:uppercase;letter-spacing:0.12em;color:var(--ink-muted);font-family:var(--font-ui);font-weight:700;">图谱统计</h3>';
      html += '<div style="display:flex;gap:20px;margin:10px 0 16px;padding:12px;background:var(--bg-alt);border:1px solid var(--border-light);border-radius:4px;">';
      html += '<div style="text-align:center;flex:1;"><span style="font-size:28px;font-weight:900;font-family:var(--font-display);color:var(--ink);line-height:1;">' + nodeCount + '</span><div style="font-size:8px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:0.12em;font-family:var(--font-ui);font-weight:600;margin-top:4px;">Nodes</div></div>';
      html += '<div style="width:1px;background:var(--border-light);"></div>';
      html += '<div style="text-align:center;flex:1;"><span style="font-size:28px;font-weight:900;font-family:var(--font-display);color:var(--ink);line-height:1;">' + edgeCount + '</span><div style="font-size:8px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:0.12em;font-family:var(--font-ui);font-weight:600;margin-top:4px;">Edges</div></div>';
      html += '</div>';

      html += '<h3 style="margin-top:12px;font-size:10px;text-transform:uppercase;letter-spacing:0.12em;color:var(--ink-muted);font-family:var(--font-ui);font-weight:700;">按类型筛选</h3>';
      Object.keys(state.graph.filters).forEach(function(type) {
        var color = NODE_COLORS[type] || '#666666';
        html += '<label class="filter-item"><input type="checkbox" checked data-type="' + esc(type) + '"><span class="filter-dot" style="background:' + color + '"></span>' + esc(type) + '</label>';
      });

      html += '<div class="graph-legend"><h3>图例</h3>';
      var shapeLabels = { rect: '&#9645;', circle: '&#9679;', diamond: '&#9670;', hexagon: '&#11042;' };
      var shownShapes = {};
      Object.keys(NODE_COLORS).forEach(function(type) {
        var shape = NODE_SHAPES[type] || 'circle';
        var color = NODE_COLORS[type];
        var key = type;
        if (shownShapes[key]) return;
        shownShapes[key] = true;
        html += '<div class="graph-legend-item"><span class="graph-legend-shape" style="color:' + color + ';font-size:14px;">' + (shapeLabels[shape] || '&#9679;') + '</span><span>' + esc(type) + '</span></div>';
      });
      html += '</div>';

      html += '<button class="btn" style="margin-top:14px;width:100%;font-size:11px;padding:8px;letter-spacing:0.06em;transition:all 0.15s ease;" data-action="rebuild-graph">↻ 重建关系图</button>';
      html += '<div id="selected-node-panel"></div>';
      var __focus = captureSearchFocus(['graph-search']);
      sb.innerHTML = html;

      sb.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
        cb.addEventListener('change', function() {
          state.graph.filters[this.dataset.type] = this.checked;
          renderGraph();
        });
      });

      var searchInput = document.getElementById('graph-search');
      if (searchInput) {
        bindImeSafeSearch(searchInput, 200, function(v){ graphSearchTerm = v.toLowerCase(); renderGraph(); });
      }
      restoreSearchFocus(__focus);
    }

    function initGraph() {
      var canvas = document.getElementById('graph-canvas');
      if (!canvas) return;
      graphSim.canvas = canvas;
      graphSim.ctx = canvas.getContext('2d');

      function resize() {
        var r = canvas.parentElement.getBoundingClientRect();
        canvas.width = r.width * window.devicePixelRatio;
        canvas.height = r.height * window.devicePixelRatio;
        canvas.style.width = r.width + 'px';
        canvas.style.height = r.height + 'px';
        graphSim.ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      }
      resize();
      window.addEventListener('resize', resize);

      var cw = canvas.width / window.devicePixelRatio;
      var ch = canvas.height / window.devicePixelRatio;
      graphSim.panX = cw / 2;
      graphSim.panY = ch / 2;

      var edgeMap = {};
      state.graph.edges.forEach(function(e) {
        edgeMap[e.sourceNodeId] = (edgeMap[e.sourceNodeId] || 0) + 1;
        edgeMap[e.targetNodeId] = (edgeMap[e.targetNodeId] || 0) + 1;
      });

      graphSim.nodes = state.graph.nodes.map(function(n, i) {
        var angle = (2 * Math.PI * i) / Math.max(state.graph.nodes.length, 1);
        var radius = Math.min(cw, ch) * 0.3;
        var deg = edgeMap[n.id] || 0;
        return {
          id: n.id, type: n.type, name: n.name, properties: n.properties,
          x: Math.cos(angle) * radius + (Math.random() - 0.5) * 50,
          y: Math.sin(angle) * radius + (Math.random() - 0.5) * 50,
          vx: 0, vy: 0,
          r: Math.max(8, Math.min(22, 8 + deg * 2.5))
        };
      });
      graphSim.edges = state.graph.edges.slice();
      graphSim.running = true;
      graphSim.dragNode = null;

      setupGraphInteraction(canvas);
      runSimulation();
    }

    function setupGraphInteraction(canvas) {
      var isPanning = false;
      var lastMX = 0, lastMY = 0;

      function canvasCoords(e) {
        var rect = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left - graphSim.panX) / graphSim.zoom,
          y: (e.clientY - rect.top - graphSim.panY) / graphSim.zoom
        };
      }
      function findNode(cx, cy) {
        for (var i = graphSim.nodes.length - 1; i >= 0; i--) {
          var n = graphSim.nodes[i];
          if (!state.graph.filters[n.type]) continue;
          var dx = n.x - cx, dy = n.y - cy;
          if (dx * dx + dy * dy < n.r * n.r + 25) return n;
        }
        return null;
      }

      canvas.addEventListener('mousedown', function(e) {
        var c = canvasCoords(e);
        var node = findNode(c.x, c.y);
        if (node) {
          graphSim.dragNode = node;
        } else {
          isPanning = true;
        }
        lastMX = e.clientX;
        lastMY = e.clientY;
        // wake the simulation if it parked itself after settling
        wakeGraphSim();
      });
      canvas.addEventListener('mousemove', function(e) {
        var dx = e.clientX - lastMX;
        var dy = e.clientY - lastMY;
        if (graphSim.dragNode) {
          graphSim.dragNode.x += dx / graphSim.zoom;
          graphSim.dragNode.y += dy / graphSim.zoom;
          graphSim.dragNode.vx = 0;
          graphSim.dragNode.vy = 0;
        } else if (isPanning) {
          graphSim.panX += dx;
          graphSim.panY += dy;
        }
        lastMX = e.clientX;
        lastMY = e.clientY;
        graphSim.mouseX = e.clientX;
        graphSim.mouseY = e.clientY;

        var c = canvasCoords(e);
        var hoverNode = findNode(c.x, c.y);
        var tooltip = document.getElementById('graph-tooltip');
        if (tooltip) {
          if (hoverNode && !graphSim.dragNode && !isPanning) {
            var conns = graphSim.edges.filter(function(ed) { return ed.sourceNodeId === hoverNode.id || ed.targetNodeId === hoverNode.id; }).length;
            var ttHtml = '<div class="tt-name">' + esc(hoverNode.name) + '</div>';
            ttHtml += '<div class="tt-type" style="color:' + (NODE_COLORS[hoverNode.type] || '#666') + '">' + esc(hoverNode.type) + '</div>';
            if (hoverNode.properties) {
              var propKeys = Object.keys(hoverNode.properties).slice(0, 3);
              propKeys.forEach(function(k) {
                ttHtml += '<div class="tt-prop">' + esc(k) + ': ' + esc(truncate(String(hoverNode.properties[k]), 30)) + '</div>';
              });
            }
            ttHtml += '<div class="tt-conns">' + conns + ' connection' + (conns !== 1 ? 's' : '') + '</div>';
            tooltip.innerHTML = ttHtml;
            var rect = canvas.getBoundingClientRect();
            tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
            tooltip.style.top = (e.clientY - rect.top + 12) + 'px';
            tooltip.classList.add('visible');
            canvas.style.cursor = 'pointer';
          } else {
            tooltip.classList.remove('visible');
            canvas.style.cursor = graphSim.dragNode || isPanning ? 'grabbing' : 'grab';
          }
        }
      });
      canvas.addEventListener('mouseup', function(e) {
        if (graphSim.dragNode && !isPanning) {
          selectGraphNode(graphSim.dragNode);
        }
        graphSim.dragNode = null;
        isPanning = false;
      });
      canvas.addEventListener('wheel', function(e) {
        e.preventDefault();
        var factor = e.deltaY > 0 ? 0.9 : 1.1;
        graphSim.zoom = Math.max(0.1, Math.min(5, graphSim.zoom * factor));
        // zoom is visually meaningless if the rAF loop is parked —
        // wake the simulation so the next frame redraws at the new scale.
        wakeGraphSim();
      }, { passive: false });
      canvas.addEventListener('dblclick', function(e) {
        var c = canvasCoords(e);
        var node = findNode(c.x, c.y);
        if (node) {
          selectGraphNode(node);
          expandNode(node.id);
        }
      });
    }

    window.zoomGraph = function(dir) {
      var factor = dir > 0 ? 1.25 : 0.8;
      graphSim.zoom = Math.max(0.1, Math.min(5, graphSim.zoom * factor));
      wakeGraphSim();
    };
    window.recenterGraph = function() {
      graphSim.zoom = 1;
      if (graphSim.canvas) {
        var cw = graphSim.canvas.width / window.devicePixelRatio;
        var ch = graphSim.canvas.height / window.devicePixelRatio;
        graphSim.panX = cw / 2;
        graphSim.panY = ch / 2;
      }
      wakeGraphSim();
    };

    function selectGraphNode(simNode) {
      state.graph.selectedNode = simNode;
      var panel = document.getElementById('selected-node-panel');
      if (!panel) return;
      var color = NODE_COLORS[simNode.type] || '#666666';
      var html = '<div class="selected-node-info">';
      html += '<h4 style="color:' + color + '">' + esc(simNode.name) + '</h4>';
      html += '<div class="prop">Type: ' + esc(simNode.type) + '</div>';
      if (simNode.properties) {
        Object.keys(simNode.properties).forEach(function(k) {
          html += '<div class="prop">' + esc(k) + ': ' + esc(truncate(simNode.properties[k], 50)) + '</div>';
        });
      }
      var conns = graphSim.edges.filter(function(e) { return e.sourceNodeId === simNode.id || e.targetNodeId === simNode.id; }).length;
      html += '<div class="prop">Connections: ' + conns + '</div>';
      html += '<button class="btn btn-primary" style="margin-top:8px;width:100%;" data-action="expand-node" data-node-id="' + esc(simNode.id) + '">展开相邻节点</button>';
      html += '</div>';
      panel.innerHTML = html;
    }

    async function expandNode(nodeId) {
      var result = await apiPost('graph/query', { startNodeId: nodeId, maxDepth: 1 });
      if (!result) return;
      var existingIds = {};
      graphSim.nodes.forEach(function(n) { existingIds[n.id] = true; });
      var parentNode = graphSim.nodes.find(function(n) { return n.id === nodeId; });
      var px = parentNode ? parentNode.x : 0;
      var py = parentNode ? parentNode.y : 0;

      (result.nodes || []).forEach(function(n) {
        if (!existingIds[n.id]) {
          state.graph.nodes.push(n);
          if (!state.graph.filters.hasOwnProperty(n.type)) state.graph.filters[n.type] = true;
          var angle = Math.random() * Math.PI * 2;
          graphSim.nodes.push({
            id: n.id, type: n.type, name: n.name, properties: n.properties,
            x: px + Math.cos(angle) * 80,
            y: py + Math.sin(angle) * 80,
            vx: 0, vy: 0, r: 8
          });
        }
      });

      var existingEdges = {};
      graphSim.edges.forEach(function(e) { existingEdges[e.id] = true; });
      (result.edges || []).forEach(function(e) {
        if (!existingEdges[e.id]) {
          state.graph.edges.push(e);
          graphSim.edges.push(e);
        }
      });
      renderGraphSidebar();
    }

    function runSimulation() {
      if (!graphSim.running) return;
      var nodes = graphSim.nodes;
      var edges = graphSim.edges;
      var nodeCount = nodes.length;
      graphSim.tickCount = (graphSim.tickCount || 0) + 1;
      // dense graphs (>1000 nodes) used to oscillate forever
      // because the per-node force pile-up exceeded what 0.9 damping
      // could bleed off each tick. Tick-decay tightens damping over
      // time so the layout actually settles; a per-node velocity cap
      // prevents any single node from being launched off-screen by an
      // accumulated kick before damping catches up.
      var coolBoost = Math.min(0.4, graphSim.tickCount / 1500);
      var damping = 0.9 - coolBoost;
      var repulsion = nodeCount > 1000 ? 3000 : nodeCount > 100 ? 2000 : nodeCount > 50 ? 1200 : 800;
      var attraction = nodeCount > 100 ? 0.002 : 0.005;
      var centerGravity = nodeCount > 1000 ? 0.012 : nodeCount > 100 ? 0.005 : 0.01;
      var velocityCap = nodeCount > 1000 ? 6 : nodeCount > 200 ? 12 : 24;

      var nodeMap = {};
      nodes.forEach(function(n) { nodeMap[n.id] = n; });

      for (var i = 0; i < nodes.length; i++) {
        if (graphSim.dragNode === nodes[i]) continue;
        var n = nodes[i];
        var fx = 0, fy = 0;
        for (var j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          var dx = n.x - nodes[j].x;
          var dy = n.y - nodes[j].y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          var force = repulsion / (dist * dist);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }
        fx -= n.x * centerGravity;
        fy -= n.y * centerGravity;
        var nvx = (n.vx + fx) * damping;
        var nvy = (n.vy + fy) * damping;
        // Velocity cap (#563): keep any single node from being launched
        // off-screen by a one-tick force spike.
        if (nvx > velocityCap) nvx = velocityCap; else if (nvx < -velocityCap) nvx = -velocityCap;
        if (nvy > velocityCap) nvy = velocityCap; else if (nvy < -velocityCap) nvy = -velocityCap;
        n.vx = nvx;
        n.vy = nvy;
      }

      edges.forEach(function(e) {
        var s = nodeMap[e.sourceNodeId];
        var t = nodeMap[e.targetNodeId];
        if (!s || !t) return;
        var dx = t.x - s.x;
        var dy = t.y - s.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var f = (dist - 100) * attraction;
        var fx = (dx / dist) * f;
        var fy = (dy / dist) * f;
        if (graphSim.dragNode !== s) { s.vx += fx; s.vy += fy; }
        if (graphSim.dragNode !== t) { t.vx -= fx; t.vy -= fy; }
      });

      var totalKineticEnergy = 0;
      nodes.forEach(function(n) {
        if (graphSim.dragNode === n) return;
        n.x += n.vx;
        n.y += n.vy;
        totalKineticEnergy += n.vx * n.vx + n.vy * n.vy;
      });

      // park the simulation when the layout is quiet to save CPU.
      // Pick up again when a drag/interaction wakes the loop.
      var rmsVelocity = nodes.length > 0 ? Math.sqrt(totalKineticEnergy / nodes.length) : 0;
      if (rmsVelocity < 0.05 && graphSim.tickCount > 60 && !graphSim.dragNode) {
        graphSim.quietTicks = (graphSim.quietTicks || 0) + 1;
      } else {
        graphSim.quietTicks = 0;
      }

      renderGraph();
      if (graphSim.quietTicks > 30) {
        graphSim.raf = null;
        return;
      }
      graphSim.raf = requestAnimationFrame(runSimulation);
    }

    async function rebuildGraph() {
      var sb = document.getElementById('graph-sidebar');
      if (sb) sb.innerHTML = '<h3>关系图</h3><p style="font-size:12px;color:var(--ink-faint);font-style:italic;">正在根据观察重建关系图...</p>';
      await apiPost('graph/build', {});
      state.graph.loaded = false;
      loadGraph();
    }

    function drawNodeShape(ctx, x, y, r, type) {
      var shape = NODE_SHAPES[type] || 'circle';
      switch(shape) {
        case 'rect':
          ctx.beginPath();
          ctx.rect(x - r, y - r * 0.75, r * 2, r * 1.5);
          break;
        case 'diamond':
          ctx.beginPath();
          ctx.moveTo(x, y - r);
          ctx.lineTo(x + r, y);
          ctx.lineTo(x, y + r);
          ctx.lineTo(x - r, y);
          ctx.closePath();
          break;
        case 'hexagon':
          ctx.beginPath();
          for (var i = 0; i < 6; i++) {
            var angle = (Math.PI / 3) * i - Math.PI / 2;
            var hx = x + r * Math.cos(angle);
            var hy = y + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          break;
        default:
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          break;
      }
    }

    function renderGraph() {
      var ctx = graphSim.ctx;
      var canvas = graphSim.canvas;
      if (!ctx || !canvas) return;
      var w = canvas.width / window.devicePixelRatio;
      var h = canvas.height / window.devicePixelRatio;

      ctx.clearRect(0, 0, w, h);

      // --- Canvas grid background ---
      var gridSize = 24;
      ctx.save();
      ctx.strokeStyle = isDarkMode() ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
      ctx.lineWidth = 0.5;
      for (var gx = 0; gx < w; gx += gridSize) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
      }
      for (var gy = 0; gy < h; gy += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.translate(graphSim.panX, graphSim.panY);
      ctx.scale(graphSim.zoom, graphSim.zoom);

      var nodeMap = {};
      graphSim.nodes.forEach(function(n) { nodeMap[n.id] = n; });

      var searchActive = graphSearchTerm.length > 0;
      var totalVisible = graphSim.nodes.filter(function(n) { return state.graph.filters[n.type]; }).length;
      var isDense = totalVisible > 40;
      var labelZoomThreshold = isDense ? 1.5 : 0.5;
      var edgeLabelZoomThreshold = isDense ? 2.5 : 1.2;
      var selectedId = state.graph.selectedNode ? state.graph.selectedNode.id : null;

      // --- Hover node detection for focus effect ---
      var hoverNodeId = null;
      if (!graphSim.dragNode && graphSim.canvas) {
        var rect = graphSim.canvas.getBoundingClientRect();
        var hx = (graphSim.mouseX - rect.left - graphSim.panX) / graphSim.zoom;
        var hy = (graphSim.mouseY - rect.top - graphSim.panY) / graphSim.zoom;
        for (var hi = graphSim.nodes.length - 1; hi >= 0; hi--) {
          var hn = graphSim.nodes[hi];
          if (!state.graph.filters[hn.type]) continue;
          var hdx = hn.x - hx, hdy = hn.y - hy;
          if (hdx * hdx + hdy * hdy < hn.r * hn.r + 25) { hoverNodeId = hn.id; break; }
        }
      }
      var focusNodeId = selectedId || hoverNodeId;

      // --- Draw edges ---
      graphSim.edges.forEach(function(e) {
        var s = nodeMap[e.sourceNodeId];
        var t = nodeMap[e.targetNodeId];
        if (!s || !t) return;
        if (!state.graph.filters[s.type] || !state.graph.filters[t.type]) return;

        var edgeDimmed = searchActive && !(s.name.toLowerCase().includes(graphSearchTerm) || t.name.toLowerCase().includes(graphSearchTerm));
        var isConnectedToFocus = focusNodeId && (e.sourceNodeId === focusNodeId || e.targetNodeId === focusNodeId);
        var isFocusActive = focusNodeId !== null;
        var weight = typeof e.weight === 'number' ? e.weight : 0.5;
        var lineWidth = isConnectedToFocus ? 2 + weight * 2 : 1 + weight * 1.5;

        var dx = t.x - s.x;
        var dy = t.y - s.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var curveOffset = isDense ? 12 : 18;
        var offsetX = -dy / len * curveOffset;
        var offsetY = dx / len * curveOffset;
        var cpx = (s.x + t.x) / 2 + offsetX;
        var cpy = (s.y + t.y) / 2 + offsetY;

        // Colored edges based on source node type
        var edgeColor = NODE_COLORS[s.type] || '#666666';
        var edgeAlpha;
        if (edgeDimmed) {
          edgeAlpha = 0.06;
        } else if (isFocusActive && isConnectedToFocus) {
          edgeAlpha = 0.65;
        } else if (isFocusActive && !isConnectedToFocus) {
          edgeAlpha = 0.06;
        } else {
          edgeAlpha = isDense ? 0.15 : 0.25;
        }

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.quadraticCurveTo(cpx, cpy, t.x, t.y);
        // Parse hex color to rgba
        var r = parseInt(edgeColor.slice(1,3), 16);
        var g = parseInt(edgeColor.slice(3,5), 16);
        var b = parseInt(edgeColor.slice(5,7), 16);
        ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + edgeAlpha + ')';
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        if (!isDense || isConnectedToFocus) {
          var arrowAngle = Math.atan2(t.y - cpy, t.x - cpx);
          var arrowLen = 5 + lineWidth;
          ctx.beginPath();
          ctx.moveTo(t.x - t.r * Math.cos(arrowAngle), t.y - t.r * Math.sin(arrowAngle));
          ctx.lineTo(t.x - (t.r + arrowLen) * Math.cos(arrowAngle - 0.3), t.y - (t.r + arrowLen) * Math.sin(arrowAngle - 0.3));
          ctx.lineTo(t.x - (t.r + arrowLen) * Math.cos(arrowAngle + 0.3), t.y - (t.r + arrowLen) * Math.sin(arrowAngle + 0.3));
          ctx.closePath();
          ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (edgeDimmed ? 0.06 : isConnectedToFocus ? 0.6 : 0.2) + ')';
          ctx.fill();
        }

        var showEdgeLabel = e.type && !edgeDimmed && (isConnectedToFocus ? graphSim.zoom > 0.6 : graphSim.zoom > edgeLabelZoomThreshold);
        if (showEdgeLabel) {
          var zoomInv = 1 / graphSim.zoom;
          ctx.save();
          ctx.fillStyle = isDarkMode() ? (isConnectedToFocus ? 'rgba(238,238,238,0.9)' : 'rgba(180,180,180,0.7)') : (isConnectedToFocus ? 'rgba(17,17,17,0.85)' : 'rgba(80,80,80,0.7)');
          ctx.font = (isConnectedToFocus ? '600 ' : '500 ') + (11 * zoomInv).toFixed(1) + 'px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(e.type, cpx, cpy - (4 * zoomInv));
          ctx.restore();
        }
      });

      // --- Draw nodes ---
      graphSim.nodes.forEach(function(n) {
        if (!state.graph.filters[n.type]) return;
        var color = NODE_COLORS[n.type] || '#666666';
        var isSelected = selectedId === n.id;
        var isHovered = hoverNodeId === n.id;
        var matchesSearch = !searchActive || n.name.toLowerCase().includes(graphSearchTerm);
        var isFocusFaded = focusNodeId && n.id !== focusNodeId && !graphSim.edges.some(function(ed) {
          return (ed.sourceNodeId === focusNodeId && ed.targetNodeId === n.id) ||
                 (ed.targetNodeId === focusNodeId && ed.sourceNodeId === n.id);
        });

        var nodeAlpha = !matchesSearch ? 0.12 : (isFocusFaded ? 0.2 : 1);

        ctx.save();
        ctx.globalAlpha = nodeAlpha;

        // Glow effect
        if (matchesSearch && !isFocusFaded && (isSelected || isHovered || !searchActive)) {
          ctx.shadowColor = color;
          ctx.shadowBlur = isSelected ? 20 : isHovered ? 16 : (isDense ? 4 : 8);
        }

        // Gradient fill
        drawNodeShape(ctx, n.x, n.y, n.r, n.type);
        var grad = ctx.createRadialGradient(n.x - n.r * 0.3, n.y - n.r * 0.3, 0, n.x, n.y, n.r * 1.2);
        var cr = parseInt(color.slice(1,3), 16);
        var cg = parseInt(color.slice(3,5), 16);
        var cb = parseInt(color.slice(5,7), 16);
        grad.addColorStop(0, 'rgba(' + Math.min(255, cr + 60) + ',' + Math.min(255, cg + 60) + ',' + Math.min(255, cb + 60) + ',0.95)');
        grad.addColorStop(1, color);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        // Selected ring
        if (isSelected) {
          ctx.save();
          drawNodeShape(ctx, n.x, n.y, n.r + 3, n.type);
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.shadowColor = color;
          ctx.shadowBlur = 12;
          ctx.stroke();
          ctx.restore();
        } else if (isHovered) {
          drawNodeShape(ctx, n.x, n.y, n.r + 2, n.type);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (searchActive && matchesSearch) {
          drawNodeShape(ctx, n.x, n.y, n.r, n.type);
          ctx.strokeStyle = '#CC0000';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        var showLabel = matchesSearch && !isFocusFaded && (
          isSelected || isHovered ||
          (searchActive && matchesSearch) ||
          (!isDense && graphSim.zoom > labelZoomThreshold) ||
          (isDense && graphSim.zoom > labelZoomThreshold && n.r > 10)
        );
        if (showLabel) {
          var zoomInv = 1 / graphSim.zoom;
          ctx.save();
          ctx.font = (isSelected || isHovered ? '600 ' : '500 ') + (13 * zoomInv).toFixed(1) + 'px Inter, sans-serif';
          ctx.textAlign = 'center';
          
          var label = truncate(n.name, 18);
          var textW = ctx.measureText(label).width;
          var labelW = textW + (16 * zoomInv);
          var labelH = 20 * zoomInv;
          var labelY = n.y + n.r + (8 * zoomInv); // Top of the background pill
          
          ctx.fillStyle = isDarkMode() ? 'rgba(30,30,35,0.92)' : 'rgba(255,255,255,0.92)';
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(n.x - labelW / 2, labelY, labelW, labelH, 4 * zoomInv) : ctx.rect(n.x - labelW / 2, labelY, labelW, labelH);
          ctx.fill();
          
          ctx.strokeStyle = isDarkMode() ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
          ctx.lineWidth = 1 * zoomInv;
          ctx.stroke();

          ctx.fillStyle = isDarkMode() ? (isSelected || isHovered ? '#eeeeee' : '#bbbbbb') : (isSelected || isHovered ? '#111111' : '#444444');
          // Vertically center text in the pill box
          ctx.fillText(label, n.x, labelY + (14 * zoomInv));
          ctx.restore();
        }
      });

      ctx.restore();

      if (graphSim.nodes.length === 0) {
        ctx.fillStyle = '#999999';
        ctx.font = '14px Lora, Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('暂无关系图数据', w / 2, h / 2 - 16);
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText('Set GRAPH_EXTRACTION_ENABLED=true to enable knowledge graph extraction.', w / 2, h / 2 + 8);
      }
    }

    async function loadMemories() {
      var el = document.getElementById('view-memories');
      el.innerHTML = '<div class="loading">加载记忆中...</div>';
      // cap at 2000 so the viewer remains responsive on large
      // corpora. Older endpoints returned the full unbounded list which
      // hit the iii invocation timeout and the UI fell through to 0.
      var result = await apiGet('memories?latest=true&limit=2000');
      var items = (result && result.memories) || [];
      // Newest first — server returns KV-insertion order.
      items.sort(function(a, b) {
        var ac = (a && a.createdAt) || (a && a.updatedAt) || '';
        var bc = (b && b.createdAt) || (b && b.updatedAt) || '';
        return bc.localeCompare(ac);
      });
      state.memories.items = items;
      state.memories.reviewItems = [];
      state.memories.total = (result && typeof result.total === 'number') ? result.total : items.length;
      state.memories.loaded = true;
      renderMemories();
    }

    function renderMemories() {
      var el = document.getElementById('view-memories');
      var items = state.memories.items;
      var search = state.memories.search.toLowerCase();
      var typeFilter = state.memories.typeFilter;
      var sourceFilter = state.memories.sourceFilter || '';

      var filtered = items.filter(function(m) {
        if (typeFilter && m.type !== typeFilter) return false;
        if (sourceFilter) {
          if (sourceFilter.indexOf('browser:') === 0) {
            if (memorySourceKind(m) !== 'browser') return false;
            if (browserSourceFromMemory(m) !== sourceFilter.slice('browser:'.length)) return false;
          } else if (memorySourceKind(m) !== sourceFilter) {
            return false;
          }
        }
        const normalizedSearch = (search || '')
          .normalize("NFKC")
          .toLowerCase();
 
        const normalizedTitle = (m.title || '')
          .normalize("NFKC")
          .toLowerCase();

        const normalizedContent = (m.content || '')
          .normalize("NFKC")
          .toLowerCase();

        if (
          search &&
          !normalizedTitle.includes(normalizedSearch) &&
          !normalizedContent.includes(normalizedSearch)
        ) {
        return false;
        }

        return true;
      });

      var types = {};
      items.forEach(function(m) { types[m.type] = true; });
      var typeOptions = Object.keys(types).sort();
      var displayGroups = {};
      var displayCount = 0;
      filtered.forEach(function(m) {
        var cat = memoryCategory(m);
        var cards = memoryDisplayCards(m);
        if (!displayGroups[cat]) displayGroups[cat] = [];
        cards.forEach(function(card) {
          displayGroups[cat].push(card);
          displayCount += 1;
        });
      });

      var html = '';

      html += '<div class="toolbar memory-toolbar">';
      html += '<button class="btn btn-primary add-memory-btn" data-action="open-add-memory" aria-label="整理会话">';
      html += '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
      html += '整理会话</button>';
      html += '<div class="memory-search-wrap' + (state.memories.search ? ' has-search' : '') + '">';
      html += '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/></svg>';
      html += '<input class="memory-search-input" type="text" id="mem-search" aria-label="搜索记忆" placeholder="搜索记忆..." value="' + esc(state.memories.search) + '">';
      html += '</div>';
      html += '<select id="mem-type-filter"><option value="">全部类型</option>';
      typeOptions.forEach(function(t) {
        html += '<option value="' + esc(t) + '"' + (typeFilter === t ? ' selected' : '') + '>' + esc(t) + '</option>';
      });
      html += '</select>';
      html += '<select id="mem-source-filter" aria-label="筛选来源"><option value="">全部来源</option>';
      [['browser', '浏览器'], ['browser:chatgpt', 'ChatGPT'], ['browser:claude', 'Claude'], ['browser:gemini', 'Gemini'], ['browser:perplexity', 'Perplexity'], ['browser:grok', 'Grok'], ['browser:deepseek', 'DeepSeek'], ['session', '会话'], ['manual', '手动']].forEach(function(item) {
        html += '<option value="' + item[0] + '"' + (sourceFilter === item[0] ? ' selected' : '') + '>' + item[1] + '</option>';
      });
      html += '</select></div>';

      html += '<div class="memory-summary" style="background:#ffffff;margin-bottom:14px;">';
      html += '<div><div class="memory-summary-title">自动整理中</div><div class="memory-summary-sub">新的聊天记录会作为记忆线索；你可以在这里审阅、编辑或删除。</div></div>';
      html += '</div>';

      if (filtered.length === 0) {
        html += '<div class="empty-state">' +
          '<div class="empty-icon icon icon-book"></div>' +
          '<div class="empty-title">还没有记忆</div>' +
          '<div class="empty-lead">当 Agent 记录事实、偏好、项目和工作方式后，会在这里按主题归档。</div>' +
          '</div>';
      } else {
        var order = ['身份档案', '偏好', '项目与目标', '判断框架', '经历'];
        Object.keys(displayGroups).forEach(function(k) { if (order.indexOf(k) < 0) order.push(k); });
        html += '<div style="display:grid;gap:12px;">';
        order.forEach(function(cat) {
          var cards = displayGroups[cat];
          if (!cards || !cards.length) return;
          html += '<section class="card memory-section" style="padding:14px 16px;">';
          html += '<div class="memory-section-head">';
          html += '<div class="memory-section-title">' + esc(cat) + '</div>';
          if (cat !== '身份档案') html += '<span class="memory-section-count">' + cards.length + ' 张卡片</span>';
          html += '</div>';
          if (cat === '身份档案') {
            html += renderIdentityProfileGroup(cards);
          } else {
            html += '<div class="memory-card-grid">';
            cards.forEach(function(card) {
              html += renderMemoryCard(card);
            });
            html += '</div>';
          }
          html += '</section>';
        });
        html += '</div>';
      }

      var __focus = captureSearchFocus(['mem-search']);
      el.innerHTML = html;

      var searchInput = document.getElementById('mem-search');
      if (searchInput) {
        bindImeSafeSearch(searchInput, 200, function(v){ state.memories.search = v; renderMemories(); });
      }
      var typeSelect = document.getElementById('mem-type-filter');
      if (typeSelect) {
        typeSelect.addEventListener('change', function() {
          state.memories.typeFilter = this.value;
          renderMemories();
        });
      }
      var sourceSelect = document.getElementById('mem-source-filter');
      if (sourceSelect) {
        sourceSelect.addEventListener('change', function() {
          state.memories.sourceFilter = this.value;
          renderMemories();
        });
      }
      restoreSearchFocus(__focus);
    }

    function deleteMemory(id, title) {
      var modal = document.getElementById('modal');
      var overlay = document.getElementById('modal-overlay');
      modal.innerHTML = '<h3>删除记忆</h3><p>确认删除「' + esc(title) + '」吗？此操作不可撤销。</p><div class="modal-actions"><button class="btn" data-action="close-modal">取消</button><button class="btn btn-danger" data-action="confirm-delete-memory" data-memory-id="' + esc(id) + '">删除</button></div>';
      overlay.classList.add('open');
    }

    function openAddMemory() {
      var modal = document.getElementById('modal');
      var overlay = document.getElementById('modal-overlay');
      modal.innerHTML =
        '<h3>补充记忆线索</h3>' +
        '<p>记忆会优先从聊天记录自动整理；这里用于补充那些没有在会话里说清楚、但希望 Agent 记住的内容。</p>' +
        '<div class="memory-add-form">' +
        '<label>线索内容<textarea id="add-memory-content" rows="7" placeholder="例如：以后创建新产品时，先给我看图片预览，再讨论技术实现。"></textarea></label>' +
        '<div class="memory-add-grid">' +
        '<label>放入位置<select id="add-memory-area"><option value="profile">身份档案</option><option value="preference">偏好</option><option value="project">项目与目标</option><option value="principle">判断框架</option><option value="history">经历</option></select></label>' +
        '<label>关联文件夹<input id="add-memory-project" placeholder="可选"></label>' +
        '</div>' +
        '<div id="add-memory-error" class="memory-form-error"></div>' +
        '</div>' +
        '<div class="modal-actions"><button class="btn" data-action="close-modal">取消</button><button class="btn btn-primary" data-action="save-new-memory">保存</button></div>';
      overlay.classList.add('open');
      setTimeout(function() {
        var input = document.getElementById('add-memory-content');
        if (input) input.focus();
      }, 0);
    }

    async function saveNewMemory() {
      var err = document.getElementById('add-memory-error');
      var content = (document.getElementById('add-memory-content') || {}).value || '';
      var area = (document.getElementById('add-memory-area') || {}).value || '';
      var project = (document.getElementById('add-memory-project') || {}).value || '';
      if (!content.trim()) {
        if (err) {
          err.style.display = 'block';
          err.textContent = '先写一点内容再保存。';
        }
        return;
      }
      var result = await apiPost('remember', {
        content: content.trim(),
        type: memoryAreaToType(area),
        project: project.trim() || undefined
      });
      if (!result || result.error) {
        if (err) {
          err.style.display = 'block';
          err.textContent = (result && result.error) || '保存失败，请稍后再试。';
        }
        return;
      }
      closeModal();
      state.memories.loaded = false;
      await loadMemories();
    }

    function editMemory(id) {
      var mem = (state.memories.items || []).find(function(m) { return m.id === id; });
      if (!mem) return;
      var modal = document.getElementById('modal');
      var overlay = document.getElementById('modal-overlay');
      var area = memoryTypeToArea(mem.type, mem);
      var isProfile = area === 'profile';
      modal.innerHTML =
        '<h3>' + (isProfile ? '完善档案' : '编辑记忆') + '</h3>' +
        '<p>' + (isProfile ? '这里会影响身份档案的完整呈现。建议按“基本信息、当前重点、沟通偏好、常用表达”补充。' : '调整内容和它在记忆库里的位置。') + '</p>' +
        '<div class="memory-add-form">' +
        '<label>标题<input id="edit-memory-title" value="' + esc(mem.title || '') + '"></label>' +
        '<div class="memory-add-grid">' +
        '<label>放入位置<select id="edit-memory-area">' +
          '<option value="profile"' + (area === 'profile' ? ' selected' : '') + '>身份档案</option>' +
          '<option value="preference"' + (area === 'preference' ? ' selected' : '') + '>偏好</option>' +
          '<option value="project"' + (area === 'project' ? ' selected' : '') + '>项目与目标</option>' +
          '<option value="principle"' + (area === 'principle' ? ' selected' : '') + '>判断框架</option>' +
          '<option value="history"' + (area === 'history' ? ' selected' : '') + '>经历</option>' +
        '</select></label>' +
        '<label>关联文件夹<input id="edit-memory-project" value="' + esc(mem.project || '') + '" placeholder="可选"></label>' +
        '</div>' +
        '<label>记忆内容<textarea id="edit-memory-content" rows="9">' + esc(mem.content || '') + '</textarea></label>' +
        '<div id="edit-memory-error" class="memory-form-error"></div>' +
        '</div>' +
        '<div class="modal-actions"><button class="btn" data-action="close-modal">取消</button><button class="btn btn-primary" data-action="save-memory" data-memory-id="' + esc(id) + '">保存</button></div>';
      overlay.classList.add('open');
    }

    async function saveMemory(id) {
      var err = document.getElementById('edit-memory-error');
      var title = (document.getElementById('edit-memory-title') || {}).value || '';
      var area = (document.getElementById('edit-memory-area') || {}).value || '';
      var project = (document.getElementById('edit-memory-project') || {}).value || '';
      var content = (document.getElementById('edit-memory-content') || {}).value || '';
      if (!content.trim()) {
        if (err) {
          err.style.display = 'block';
          err.textContent = '内容不能为空。';
        }
        return;
      }
      var result = await apiPatch('memories/' + encodeURIComponent(id), {
        title: title.trim(),
        type: memoryAreaToType(area),
        project: project.trim(),
        content: content.trim()
      });
      if (!result || result.error) {
        if (err) {
          err.style.display = 'block';
          err.textContent = (result && result.error) || '保存失败，请稍后再试。';
        }
        return;
      }
      closeModal();
      state.memories.loaded = false;
      await loadMemories();
    }

    async function confirmDeleteMemory(id) {
      closeModal();
      await apiDelete('governance/memories', { memoryIds: [id], reason: 'Deleted via viewer' });
      state.memories.loaded = false;
      loadMemories();
    }

    function editReviewItem(id) {
      var item = (state.memories.reviewItems || []).filter(isReviewItemDisplayable).find(function(x) { return x.id === id; }) ||
        (state.actions.reviewItems || []).filter(isReviewItemDisplayable).find(function(x) { return x.id === id; });
      if (!item) return;
      var payload = item.payload || {};
      var isAction = item.kind === 'action';
      var sourceLabel = reviewSourceLabel(item);
      var defaultTags = reviewTags(item).length ? reviewTags(item).join(', ') : ['browser', 'reviewed', payload.provider ? 'source:' + String(payload.provider).toLowerCase() : '', item.page && item.page.type ? 'page:' + item.page.type : ''].filter(Boolean).join(', ');
      var defaultProject = reviewProject(item);
      var modal = document.getElementById('modal');
      var overlay = document.getElementById('modal-overlay');
      modal.innerHTML =
        '<h3>审阅后保存</h3>' +
        '<p>这条内容来自 ' + esc(sourceLabel) + '。确认前可以调整标题、内容和归属，避免临时信息直接进入待办列表。</p>' +
        '<div class="memory-add-form">' +
        '<label>标题<input id="review-title" value="' + esc(item.title || '') + '"></label>' +
        '<label>内容<textarea id="review-content" rows="8">' + esc(item.content || '') + '</textarea></label>' +
        '<div class="memory-add-grid">' +
        '<label>类型<select id="review-kind"><option value="action" selected>行动候选</option></select></label>' +
        '<label>项目<input id="review-project" value="' + esc(defaultProject) + '"></label>' +
        '</div>' +
        '<div class="memory-add-grid">' +
        (isAction ? '<label>优先级<input id="review-priority" type="number" min="1" max="10" value="' + esc(reviewActionPriority(item)) + '"></label>' : '<label>记忆类型<select id="review-type"><option value="fact"' + (payload.type === 'fact' || !payload.type ? ' selected' : '') + '>事实</option><option value="preference"' + (payload.type === 'preference' ? ' selected' : '') + '>偏好</option><option value="workflow"' + (payload.type === 'workflow' ? ' selected' : '') + '>工作流</option><option value="pattern"' + (payload.type === 'pattern' ? ' selected' : '') + '>模式</option><option value="architecture"' + (payload.type === 'architecture' ? ' selected' : '') + '>架构</option><option value="bug"' + (payload.type === 'bug' ? ' selected' : '') + '>问题</option></select></label>') +
        '<label>标签<input id="review-tags" value="' + esc(defaultTags) + '"></label>' +
        '</div>' +
        '<div id="review-error" class="memory-form-error"></div>' +
        '</div>' +
        '<div class="modal-actions"><button class="btn" data-action="close-modal">取消</button><button class="btn btn-primary" data-action="approve-review" data-review-id="' + esc(id) + '">确认写入</button></div>';
      overlay.classList.add('open');
    }

    async function approveReviewItem(id) {
      var fromActionsReview = (state.actions.reviewItems || []).some(function(x) { return x.id === id; });
      var err = document.getElementById('review-error');
      var title = (document.getElementById('review-title') || {}).value || '';
      var content = (document.getElementById('review-content') || {}).value || '';
      var kind = (document.getElementById('review-kind') || {}).value || 'memory';
      var project = (document.getElementById('review-project') || {}).value || '';
      var type = (document.getElementById('review-type') || {}).value || 'fact';
      var priority = parseInt((document.getElementById('review-priority') || {}).value || '', 10);
      var tags = (document.getElementById('review-tags') || {}).value || '';
      if (!content.trim()) {
        if (err) {
          err.style.display = 'block';
          err.textContent = '内容不能为空。';
        }
        return;
      }
      var result = await apiPost('review/approve', {
        id: id,
        title: title.trim(),
        content: content.trim(),
        kind: kind,
        project: project.trim() || undefined,
        type: type,
        priority: Number.isFinite(priority) ? priority : undefined,
        tags: tags
      });
      if (!result || result.error) {
        if (err) {
          err.style.display = 'block';
          err.textContent = (result && result.error) || '写入失败，请稍后再试。';
        }
        return;
      }
      closeModal();
      state.memories.loaded = false;
      if (state.activeTab === 'actions' || fromActionsReview) {
        state.actions.loaded = false;
        await loadActions();
      } else {
        await loadMemories();
      }
    }

    async function dismissReviewItem(id) {
      var fromActionsReview = (state.actions.reviewItems || []).some(function(x) { return x.id === id; });
      await apiPost('review/dismiss', { id: id });
      state.memories.reviewItems = (state.memories.reviewItems || []).filter(function(x) { return x.id !== id; });
      state.actions.reviewItems = (state.actions.reviewItems || []).filter(function(x) { return x.id !== id; });
      if (state.activeTab === 'actions' || fromActionsReview) {
        renderActions();
      } else {
        renderMemories();
      }
    }

    function closeModal() {
      document.getElementById('modal-overlay').classList.remove('open');
    }

    async function loadTimeline() {
      var el = document.getElementById('view-timeline');
      el.innerHTML = '<div class="loading">加载时间线中...</div>';
      var sessResult = await apiGet('sessions');
      var localSessions = await loadLocalCodexSessions(120);
      var sessions = mergeSessions(((sessResult && sessResult.sessions) || []), localSessions).filter(function(s) { return !isDemoSession(s); });
      state.timeline.sessions = sessions;
      state.timeline.loaded = true;

      var groups = groupSessionsByProject(sessions);
      if (groups.length > 0 && !state.timeline.projectKey) {
        state.timeline.projectKey = groups[0].key;
      }

      renderTimelineToolbar(groups);
      if (state.timeline.projectKey) await loadObservations();
    }

    function renderTimelineToolbar(groups) {
      var el = document.getElementById('view-timeline');
      groups = (groups || []).map(function(g) {
        return g && g.sessions ? g : groupSessionsByProject([g])[0];
      }).filter(Boolean);
      var html = '<div class="toolbar">';
      html += '<select id="tl-project"><option value="">选择文件夹</option>';
      groups.forEach(function(g) {
        html += '<option value="' + esc(g.key) + '"' + (state.timeline.projectKey === g.key ? ' selected' : '') + '>' + esc(g.name) + ' · ' + g.count + ' 段</option>';
      });
      html += '</select>';
	      html += '<span class="mode-switch" aria-label="时间线显示模式">';
	      html += '<button type="button" class="' + (state.timeline.mode === 'episodes' ? 'active' : '') + '" data-action="timeline-mode" data-mode="episodes">故事模式</button>';
	      html += '<button type="button" class="' + (state.timeline.mode === 'events' ? 'active' : '') + '" data-action="timeline-mode" data-mode="events">事件模式</button>';
	      html += '</span></div>';
      html += '<div id="tl-content"></div>';
      el.innerHTML = html;

      document.getElementById('tl-project').addEventListener('change', function() {
        state.timeline.projectKey = this.value;
        state.timeline.sessionId = '';
        state.timeline.page = 0;
        loadObservations();
      });
    }

    async function loadObservations() {
      var content = document.getElementById('tl-content');
      if (!content) return;
      if (!state.timeline.projectKey) {
        content.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128337;</div><p>请选择一个文件夹查看时间线</p></div>';
        return;
      }
      content.innerHTML = '<div class="loading">加载观察记录中...</div>';
      var sessions = (state.timeline.sessions || []).filter(function(s) { return sessionProjectKey(s) === state.timeline.projectKey && sessionId(s); });
      var localOnly = sessions.every(function(s) { return String(s.source || '') === 'local-codex-jsonl'; });
      if (localOnly) {
        state.timeline.observations = sessions.map(function(s) {
          return {
            id: sessionId(s),
            sessionId: sessionId(s),
            timestamp: sessionRecordTime(s),
            type: 'conversation',
            title: sessionTitleText(s) || 'Codex 会话',
            narrative: sessionBodyPreview(s, sessionTitleText(s)),
            importance: 5,
            _sessionId: sessionId(s),
            _sessionName: sessionDisplayName(s)
          };
        }).sort(function(a, b) {
          return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
        });
        renderObservations();
        return;
      }
      var results = await Promise.all(sessions.map(function(s) {
        return apiGet('observations?sessionId=' + encodeURIComponent(sessionId(s))).then(function(result) {
          var list = (result && result.observations) || [];
          return list.map(function(o) {
            o._sessionId = sessionId(s);
            o._sessionName = sessionDisplayName(s);
            return o;
          });
        }).catch(function() { return []; });
      }));
      state.timeline.observations = results.reduce(function(acc, list) { return acc.concat(list); }, []).sort(function(a, b) {
        return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
      });
      renderObservations();
    }

    var tlTypeFilter = '';

    function renderObservations() {
      var content = document.getElementById('tl-content');
	      if (!content) return;
	      var obs = state.timeline.observations;
	      var minImp = state.timeline.minImportance;
	      var filtered = minImp > 0 ? obs.filter(function(o) { return (o.importance || 0) >= minImp; }) : obs;
	      var html = '';

		      var typeCounts = {};
	      filtered.forEach(function(o) {
	        var t = observationType(o);
	        typeCounts[t] = (typeCounts[t] || 0) + 1;
	      });
      var typeList = Object.keys(typeCounts).sort(function(a, b) { return typeCounts[b] - typeCounts[a]; });

	      if (tlTypeFilter) {
	        filtered = filtered.filter(function(o) {
	          var t = observationType(o);
	          return t === tlTypeFilter;
	        });
	      }

	      var pageSize = state.timeline.pageSize;
	      var page = state.timeline.page;

	      if (state.timeline.mode === 'episodes') {
	        var allEpisodes = buildTimelineEpisodes(filtered);
	        var episodeFilter = state.timeline.episodeFilter || 'all';
	        var filterCounts = { all: allEpisodes.length, important: 0 };
	        allEpisodes.forEach(function(ep) {
	          if (ep.kind === 'important' || ep.kind === 'user_need' || ep.kind === 'bugfix') filterCounts.important++;
	        });
	        html += '<div class="type-chips" style="margin-bottom:12px;">';
	        [
	          ['all', '全部'],
	          ['important', '重点']
	        ].forEach(function(item) {
	          var key = item[0];
	          var label = item[1];
	          html += '<span class="type-chip' + (episodeFilter === key ? ' active' : '') + '" data-action="episode-filter" data-episode-filter="' + key + '">' + label + ' (' + (filterCounts[key] || 0) + ')</span>';
	        });
	        html += '</div>';
	        var episodes = filterTimelineEpisodes(allEpisodes);
	        var epPageSize = Math.max(10, Math.floor(pageSize / 2));
	        var epPage = page;
	        var epStart = epPage * epPageSize;
	        var epPaged = episodes.slice(epStart, epStart + epPageSize);
	        var epTotalPages = Math.ceil(episodes.length / epPageSize);
	        html += '<div style="font-size:12px;color:var(--ink-secondary);margin-bottom:16px;line-height:1.6;">故事模式会把同一段工作里的底层记录合并成可读片段。需要看完整流水时，可以切到事件模式。</div>';
	        if (epPaged.length === 0) {
	          html += '<div class="empty-state"><div class="empty-icon">&#128337;</div><p>暂无可整理的工作片段</p></div>';
	          content.innerHTML = html;
	          return;
	        }
		        epPaged.forEach(function(ep) {
		          var accent = ep.importance >= 7 ? OBS_TYPE_COLORS.decision : ep.importance >= 4 ? OBS_TYPE_COLORS.discovery : OBS_TYPE_COLORS.other;
		          var expanded = !!state.timeline.expandedEpisodes[ep.key];
		          var visibleActions = expanded ? ep.actions : ep.actions.slice(0, 2);
		          html += '<div class="episode-card' + (expanded ? ' expanded' : '') + '" style="border-left-color:' + accent + ';">';
		          html += '<div class="episode-kind">' + esc(episodeKindLabel(ep.kind)) + '</div>';
		          html += '<div class="episode-title">' + esc(ep.title) + '</div>';
		          html += '<div class="episode-meta">';
	          html += '<span>' + esc(formatTime(ep.start)) + (ep.end && ep.end !== ep.start ? ' - ' + esc(shortTime(ep.end)) : '') + '</span>';
	          html += '<span>' + ep.count + ' 条记录</span>';
	          html += '<span>' + esc(ep.typeText) + '</span>';
		          html += '</div>';
		          html += '<div class="episode-body">' + esc(ep.body) + '</div>';
		          if (visibleActions.length > 0) {
		            html += '<ul class="episode-actions">';
		            visibleActions.forEach(function(a) { html += '<li>' + esc(a) + '</li>'; });
		            html += '</ul>';
		          }
		          html += '<div class="episode-footer">';
		          html += '<span style="font-size:11px;color:var(--ink-faint);">' + (ep.actions.length > 2 ? '还有 ' + (ep.actions.length - 2) + ' 条细节' : '细节已完整展示') + '</span>';
		          if (ep.actions.length > 2) html += '<button class="btn" data-action="episode-toggle" data-episode-key="' + esc(ep.key) + '">' + (expanded ? '收起细节' : '展开细节') + '</button>';
		          html += '</div>';
		          html += '</div>';
		        });
	        if (epTotalPages > 1) {
	          html += '<div class="pagination">';
	          if (epPage > 0) html += '<button class="btn" data-action="timeline-page" data-page="' + (epPage - 1) + '">上一页</button>';
	          html += '<span style="color:var(--ink-faint);font-size:12px;padding:6px;font-family:var(--font-mono);">第 ' + (epPage + 1) + ' / ' + epTotalPages + ' 页（共 ' + episodes.length + ' 段）</span>';
	          if (epPage < epTotalPages - 1) html += '<button class="btn" data-action="timeline-page" data-page="' + (epPage + 1) + '">下一页</button>';
	          html += '</div>';
	        }
	        content.innerHTML = html;
	        return;
	      }

	      var start = page * pageSize;
      var paged = filtered.slice(start, start + pageSize);
      var totalPages = Math.ceil(filtered.length / pageSize);

	      html += '<div class="type-chips">';
      html += '<span class="type-chip' + (!tlTypeFilter ? ' active' : '') + '" data-action="timeline-filter" data-type-filter="">全部 (' + obs.length + ')</span>';
      typeList.forEach(function(t) {
        var color = OBS_TYPE_COLORS[t] || '#666666';
        html += '<span class="type-chip' + (tlTypeFilter === t ? ' active' : '') + '" data-action="timeline-filter" data-type-filter="' + esc(t) + '" style="' + (tlTypeFilter === t ? 'background:' + color + ';border-color:' + color + ';' : 'border-color:' + color + ';color:' + color + ';') + '">' + esc(t.replace(/_/g, ' ')) + ' (' + typeCounts[t] + ')</span>';
      });
      html += '</div>';

      if (paged.length === 0) {
        html += '<div class="empty-state"><div class="empty-icon">&#128337;</div><p>暂无观察记录' + (obs.length > 0 ? '（当前筛选无结果，共 ' + obs.length + ' 条）' : '（该会话下）') + '</p></div>';
        content.innerHTML = html;
        return;
      }

      html += '<div style="font-size:11px;color:var(--ink-faint);margin-bottom:16px;font-family:var(--font-ui);letter-spacing:0.03em;">当前文件夹共显示 ' + filtered.length + ' 条记录</div>';

      html += '<div class="timeline-container">';

      var lastDateGroup = '';
      paged.forEach(function(o, idx) {
        var isCompressed = !!o.narrative || !!o.type;
        var isRaw = !isCompressed;
	        var type = observationType(o);
        var isFocusEvent = type === 'decision' || type === 'error' || type === 'task' || type === 'conversation';
        var impClass = isFocusEvent ? 'high' : 'low';
        var display = observationDisplay(o);
        var title = display.title;
        var typeColor = OBS_TYPE_COLORS[type] || '#666666';
        var icon = OBS_TYPE_ICONS[type] || '&#128196;';

        var dateGroup = '';
        try {
          var d = new Date(o.timestamp);
          dateGroup = d.toLocaleDateString() + ' ' + d.getHours() + ':00';
        } catch(e) { dateGroup = ''; }

        if (dateGroup && dateGroup !== lastDateGroup) {
          html += '<div class="timeline-date-marker"><span>' + esc(dateGroup) + '</span></div>';
          lastDateGroup = dateGroup;
        }

        var side = idx % 2 === 0 ? 'tl-left' : 'tl-right';

        html += '<div class="timeline-item ' + side + '">';
        html += '<div class="timeline-dot" style="background:' + typeColor + ';"></div>';
        html += '<div class="timeline-connector"></div>';

        html += '<div class="obs-card imp-' + impClass + '" style="border-left-color:' + typeColor + ';text-align:left;">';
        html += '<div class="obs-head">';
        html += '<div class="obs-title-row">';
        html += '<span class="obs-type-icon">' + icon + '</span>';
        html += '<span class="obs-title" title="' + esc(title) + '">' + esc(title) + '</span>';
        if (isRaw) html += '<span class="badge badge-muted" style="font-size:8px;margin-left:4px;">raw</span>';
        html += '</div>';
        html += '<div class="obs-meta">';
        html += '<span class="obs-time">' + esc(shortTime(o.timestamp)) + '</span>';
        html += '</div></div>';

        if (display.subtitle) html += '<div class="obs-subtitle">' + esc(display.subtitle) + '</div>';

        html += '<div style="margin-top:4px;">';
        html += '<span class="badge" style="border-color:' + typeColor + ';color:' + typeColor + ';margin-right:4px;">' + esc(type.replace(/_/g, ' ')) + '</span>';
        if (o.hookType) html += '<span class="badge badge-muted" style="margin-right:4px;">' + esc(o.hookType) + '</span>';
        html += '</div>';

        if (isRaw && o.toolInput) {
          var inputStr = typeof o.toolInput === 'string' ? o.toolInput : JSON.stringify(o.toolInput);
          html += '<div style="margin-top:6px;"><span style="font-size:10px;color:var(--ink-muted);font-weight:600;font-family:var(--font-ui);text-transform:uppercase;letter-spacing:0.08em;">输入：</span>';
          html += '<pre style="font-size:11px;color:var(--ink-muted);background:var(--bg-alt);padding:8px 10px;border:1px solid var(--border-light);margin-top:3px;overflow-x:auto;max-height:80px;font-family:var(--font-mono);">' + esc(truncate(inputStr, 300)) + '</pre></div>';
        }
        if (isRaw && o.toolOutput) {
          var outputStr = typeof o.toolOutput === 'string' ? o.toolOutput : JSON.stringify(o.toolOutput);
          html += '<div style="margin-top:4px;"><span style="font-size:10px;color:var(--ink-muted);font-weight:600;font-family:var(--font-ui);text-transform:uppercase;letter-spacing:0.08em;">输出：</span>';
          html += '<div class="obs-narrative" style="margin-top:3px;">' + esc(truncate(outputStr, 300)) + '</div></div>';
        }
        if (display.body) html += '<div class="obs-narrative" style="margin-top:8px;">' + esc(display.body) + '</div>';
        if (o.facts && o.facts.length > 0) {
          html += '<ul class="obs-facts">';
          o.facts.forEach(function(f) { html += '<li>' + esc(f) + '</li>'; });
          html += '</ul>';
        }

        var hasTags = (o.concepts && o.concepts.length) || (o.files && o.files.length);
        if (hasTags) {
          html += '<div class="tag-list">';
          (o.concepts || []).forEach(function(c) { html += '<span class="tag">' + esc(c) + '</span>'; });
          (o.files || []).forEach(function(f) {
            var short = f.split('/').pop();
            html += '<span class="tag file-tag" title="' + esc(f) + '">' + esc(short) + '</span>';
          });
          html += '</div>';
        }
        if (isRaw && o.toolInput) {
          var files = [];
          var ti = o.toolInput;
          if (typeof ti === 'object' && ti !== null) {
            if (ti.file_path) files.push(ti.file_path);
            if (ti.path) files.push(ti.path);
          }
          if (files.length > 0) {
            html += '<div class="tag-list">';
            files.forEach(function(f) {
              var short = String(f).split('/').pop();
              html += '<span class="tag file-tag" title="' + esc(f) + '">' + esc(short) + '</span>';
            });
            html += '</div>';
          }
        }
        html += '</div>';
        html += '</div>';
      });

      html += '</div>';

      if (totalPages > 1) {
        html += '<div class="pagination">';
        if (page > 0) html += '<button class="btn" data-action="timeline-page" data-page="' + (page - 1) + '">上一页</button>';
        html += '<span style="color:var(--ink-faint);font-size:12px;padding:6px;font-family:var(--font-mono);">第 ' + (page + 1) + ' / ' + totalPages + ' 页（共 ' + filtered.length + ' 条）</span>';
        if (page < totalPages - 1) html += '<button class="btn" data-action="timeline-page" data-page="' + (page + 1) + '">下一页</button>';
        html += '</div>';
      }

      content.innerHTML = html;
    }

    function setTlTypeFilter(type) {
      tlTypeFilter = type;
      state.timeline.page = 0;
      renderObservations();
    }

    function tlPage(p) {
      state.timeline.page = p;
      renderObservations();
    }

    async function loadActivity() {
      var el = document.getElementById('view-activity');
      state.activity.loadingPhase = '正在读取本地会话';
      el.innerHTML = '<div class="loading">加载活动中...</div>';
      state.activity.warnings = [];
      var results = await Promise.all([
        settledData('工作台会话', { sessions: [] }, function() { return apiGet('sessions'); }),
        settledData('审计记录', { entries: [] }, function() { return apiGet('audit?limit=80'); }),
        settledData('本地会话', [], function() { return loadLocalCodexSessions(60); })
      ]);
      state.activity.warnings = results.filter(function(r) { return r.failed; }).map(function(r) { return r.label; });
      var sessions = mergeSessions(((results[0].data && results[0].data.sessions) || []), results[2].data || []).filter(function(s) { return !isDemoSession(s); });
      var auditEntries = (results[1].data && results[1].data.entries) || [];

      var allObs = [];
      var sorted = sessions.slice().sort(function(a, b) { return (b.startedAt || '').localeCompare(a.startedAt || ''); });
      var localObs = sorted.filter(function(s) {
        return String(s.source || '') === 'local-codex-jsonl';
      }).map(function(s) {
        return {
          id: sessionId(s),
          sessionId: sessionId(s),
          timestamp: sessionRecordTime(s),
          type: 'conversation',
          title: sessionTitleText(s) || 'Codex 会话',
          narrative: sessionBodyPreview(s, sessionTitleText(s)),
          project: s.project,
          cwd: s.cwd,
          agentId: 'Codex'
        };
      }).filter(function(o) {
        var t = String(o.title || '');
        return t && t !== 'Codex Desktop' && t.indexOf('Automation:') !== 0;
      });
      allObs = allObs.concat(localObs);

      var recentSessions = sorted.filter(function(s) {
        return String(s.source || '') !== 'local-codex-jsonl';
      }).slice(0, 5);

      state.activity.sessions = sessions;
      state.activity.observations = allObs;
      state.activity.audit = auditEntries;
      state.activity.loaded = true;
      state.activity.loadingPhase = recentSessions.length ? '正在补齐最近会话细节' : '';
      renderActivity();

      var obsResults = await Promise.all(recentSessions.filter(function(s) { return sessionId(s); }).map(function(s) {
        return settledData('会话细节', null, function() { return apiGet('observations?sessionId=' + encodeURIComponent(sessionId(s))); });
      }));
      obsResults.forEach(function(r) {
        if (r && r.failed && state.activity.warnings.indexOf(r.label) < 0) state.activity.warnings.push(r.label);
        if (r && r.data && r.data.observations) allObs = allObs.concat(r.data.observations);
      });
      state.activity.observations = allObs;
      state.activity.loadingPhase = '';
      renderActivity();
    }

    function renderActivity() {
      var el = document.getElementById('view-activity');
      var obs = state.activity.observations;
      var sessions = state.activity.sessions;

      var TOOL_TYPE_MAP = { Read: 'file_read', Write: 'file_write', Edit: 'file_edit', Bash: 'command_run', Grep: 'search', Glob: 'search', WebFetch: 'web_fetch', WebSearch: 'web_fetch', AskUserQuestion: 'conversation', Task: 'subagent' };

      var html = '';

      html += renderDataWarnings(state.activity.warnings, 'refresh-activity');

      if (state.activity.loadingPhase) {
        html += '<div class="activity-status-card"><div class="activity-status-main"><span class="activity-status-dot"></span><span>' + esc(state.activity.loadingPhase) + '</span></div><div class="activity-status-meta">' + obs.length + ' 条</div></div>';
      }

      html += '<div class="card"><div class="card-title">活动热力图（近一年）</div>';
      var dayCounts = {};
      obs.forEach(function(o) {
        try {
          var d = new Date(o.timestamp);
          var key = d.toISOString().slice(0, 10);
          dayCounts[key] = (dayCounts[key] || 0) + 1;
        } catch(e) {}
      });
      sessions.forEach(function(s) {
        try {
          var d = new Date(s.startedAt);
          var key = d.toISOString().slice(0, 10);
          dayCounts[key] = (dayCounts[key] || 0) + 1;
        } catch(e) {}
      });

      var maxCount = 0;
      Object.keys(dayCounts).forEach(function(k) { if (dayCounts[k] > maxCount) maxCount = dayCounts[k]; });

      var today = new Date();
      var dayLabels = ['一', '', '三', '', '五', '', ''];
      html += '<div class="heatmap-labels">';
      dayLabels.forEach(function(l) { html += '<span style="width:10px;text-align:center;">' + l + '</span>'; });
      html += '</div>';
      html += '<div class="heatmap-wrap"><div class="heatmap-grid">';
      for (var w = 51; w >= 0; w--) {
        for (var d = 0; d < 7; d++) {
          var cellDate = new Date(today);
          cellDate.setDate(cellDate.getDate() - (w * 7 + (6 - d)));
          var key = cellDate.toISOString().slice(0, 10);
          var count = dayCounts[key] || 0;
          var level = count === 0 ? '' : count <= (maxCount * 0.25) ? 'level-1' : count <= (maxCount * 0.5) ? 'level-2' : count <= (maxCount * 0.75) ? 'level-3' : 'level-4';
          var title = key + '：' + count + ' 条活动';
          html += '<div class="heatmap-cell ' + level + '" title="' + esc(title) + '"></div>';
        }
      }
      html += '</div></div>';
      html += '<div style="display:flex;align-items:center;gap:4px;margin-top:8px;font-size:10px;color:var(--ink-faint);font-family:var(--font-mono);justify-content:flex-end;">较少 ';
      html += '<div class="heatmap-cell" style="display:inline-block;"></div>';
      html += '<div class="heatmap-cell level-1" style="display:inline-block;"></div>';
      html += '<div class="heatmap-cell level-2" style="display:inline-block;"></div>';
      html += '<div class="heatmap-cell level-3" style="display:inline-block;"></div>';
      html += '<div class="heatmap-cell level-4" style="display:inline-block;"></div>';
      html += ' 较多</div>';
      html += '</div>';

      var typeCounts = {};
      obs.forEach(function(o) {
        var t = o.type || TOOL_TYPE_MAP[o.toolName] || (o.hookType ? o.hookType.replace(/_/g, ' ') : 'other');
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      });
      var typeList = Object.keys(typeCounts).sort(function(a, b) { return typeCounts[b] - typeCounts[a]; });
      var totalObs = obs.length || 1;

      html += '<div class="two-col" style="margin-top:16px;">';

      html += '<div class="card"><div class="card-title">类型分布</div>';
      if (typeList.length === 0) {
        html += '<div style="font-size:13px;color:var(--ink-faint);font-style:italic;">还没有观察记录</div>';
      } else {
        html += '<div class="bar-chart">';
        typeList.slice(0, 12).forEach(function(t) {
          var pct = Math.round((typeCounts[t] / totalObs) * 100);
          var color = OBS_TYPE_COLORS[t] || '#666666';
          html += '<div class="bar-row"><span class="bar-label">' + esc(observationTypeLabel(t)) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + color + ';"></div></div><span class="bar-value">' + typeCounts[t] + '</span></div>';
        });
        html += '</div>';
      }
      html += '</div>';

      html += '<div class="card"><div class="card-title">活动流</div>';
      var sortedObs = obs.slice().sort(function(a, b) { return (b.timestamp || '').localeCompare(a.timestamp || ''); });
      if (sortedObs.length === 0) {
        html += '<div style="font-size:13px;color:var(--ink-faint);font-style:italic;">暂无最近活动</div>';
      } else {
        sortedObs.slice(0, 20).forEach(function(o) {
          var type = o.type || TOOL_TYPE_MAP[o.toolName] || 'other';
          var typeColor = OBS_TYPE_COLORS[type] || '#666666';
          var icon = OBS_TYPE_ICONS[type] || '&#128196;';
          var display = observationDisplay(o);
          var title = display.title;

          var sess = sessions.find(function(s) { return sessionId(s) && (sessionId(s) === o.sessionId || sessionId(s) === o.session_id); });
          var source = inferSessionSource(sess || { project: o.project || '', cwd: o.cwd || '' });
          var avatar = agentAvatarSpec(source.name);
          html += '<div class="activity-feed-item">';
          html += renderAgentAvatar(avatar);
          html += '<div class="activity-feed-body">';
          html += '<div class="activity-feed-title">' + esc(truncate(title, 60)) + '</div>';
          if (display.body) html += '<div style="font-size:12px;color:var(--ink-muted);margin-top:2px;">' + esc(truncate(display.body, 120)) + '</div>';
          html += '<div class="activity-feed-meta">' + esc(source.name) + ' · ' + esc(observationTypeLabel(type));
          if (o.files && o.files.length) html += ' &middot; <span class="tag file-tag" style="font-size:9px;padding:0 4px;">' + esc(o.files[0].split('/').pop()) + '</span>';
          html += ' &middot; ' + esc(shortTime(o.timestamp)) + '</div>';
          html += '</div></div>';
        });
      }
      html += '</div>';

      html += '</div>';

      el.innerHTML = html;
    }

    async function loadSessions(options) {
      options = options || {};
      var reason = options.reason || 'manual';
      var showLoading = options.showLoading !== false;
      var requestSeq = (state.sessions.requestSeq || 0) + 1;
      state.sessions.requestSeq = requestSeq;
      var el = document.getElementById('view-sessions');
      if (showLoading || !state.sessions.loaded) el.innerHTML = '<div class="loading">加载会话中...</div>';
      var results = await Promise.all([
        settledData('工作台会话', { sessions: [] }, function() { return apiGet('sessions'); }),
        settledData('本地会话', [], function() { return loadLocalCodexSessions(120); }),
        settledData('浏览器对话', { items: [] }, function() { return apiGet('review?limit=200'); })
      ]);
      if (state.sessions.requestSeq !== requestSeq) return;
      state.sessions.warnings = results.filter(function(r) { return r.failed; }).map(function(r) { return r.label; });
      var browserSessions = browserReviewSessions((results[2].data && results[2].data.items) || []);
      state.sessions.items = mergeSessions(((results[0].data && results[0].data.sessions) || []).concat(browserSessions), results[1].data || []).filter(function(s) { return !isDemoSession(s); });
      pruneSessionHighlightCache(state.sessions.items);
      pruneSessionDetailCache(state.sessions.items);
      if (reason === 'manual') state.sessions.stale = false;
      state.sessions.loaded = true;
      renderSessions();
    }

    function renderSessions() {
      var el = document.getElementById('view-sessions');
      var items = state.sessions.items.slice().sort(function(a, b) {
        return (sessionRecordTime(b) || '').localeCompare(sessionRecordTime(a) || '');
      });

      var html = '<div class="session-list">';
      html += renderDataWarnings(state.sessions.warnings, 'refresh-sessions');
      html += '<div id="sessions-stale-notice">' + sessionStaleNoticeMarkup() + '</div>';
      if (items.length === 0) {
        html += '<div class="empty-state"><div class="empty-icon">&#128466;</div><p>' + (state.sessions.warnings && state.sessions.warnings.length ? t('ses.emptyNeedRetry') : t('ses.empty')) + '</p>';
        if (state.sessions.warnings && state.sessions.warnings.length) html += '<div style="margin-top:10px;"><button class="btn btn-primary" data-action="refresh-sessions">' + t('ses.retry') + '</button></div>';
        html += '</div>';
      } else {
        var groupMode = state.sessions.groupMode === 'source' ? 'source' : 'folder';
        state.sessions.groupMode = groupMode;
        var projectGroups = groupSessionsByProject(items);
        var sourceGroups = sessionSourceGroups(items);
        var folderGroups = [{
          key: 'all',
          name: t('ses.allSessions'),
          sessions: items,
          count: items.length,
          latest: projectGroups[0] ? projectGroups[0].latest : '',
          observations: items.reduce(function(sum, s) { return sum + (s.observationCount || 0); }, 0),
          sources: {},
          hasMissingId: false
        }].concat(projectGroups);
        var groups = groupMode === 'source' ? sourceGroups.map(function(g) {
          return {
            key: g.key,
            name: g.name,
            count: g.count,
            latest: g.latest,
            observations: g.observations,
            sessions: g.key === 'all' ? items : items.filter(function(s) { return sessionSourceKey(s) === g.key; })
          };
        }) : folderGroups;
        var activeGroupKey = groupMode === 'source' ? (state.sessions.sourceKey || 'all') : (state.sessions.folderKey || 'all');
        if (!groups.some(function(g) { return g.key === activeGroupKey; })) activeGroupKey = 'all';
        if (groupMode === 'source') state.sessions.sourceKey = activeGroupKey;
        else state.sessions.folderKey = activeGroupKey;
        var activeGroup = groups.find(function(g) { return g.key === activeGroupKey; }) || groups[0];
        var visibleItems = activeGroup.sessions || [];
        var totalObs = items.reduce(function(sum, s) { return sum + (s.observationCount || 0); }, 0);
        html += '<div class="session-hero">';
        html += '<div><div class="session-hero-title">' + t('ses.heroTitle') + '</div><div class="session-hero-note">' + t('ses.heroNote') + '</div></div>';
        html += '<div class="session-hero-meta">' + items.length + ' ' + t('ses.unitSessions') + ' · ' + projectGroups.length + ' ' + t('ses.unitFolders') + ' · ' + (sourceGroups.length - 1) + ' ' + t('ses.unitSources') + ' · ' + totalObs + ' ' + t('ses.unitRecords') + '</div>';
        html += '</div>';
        html += '<div id="session-detail"></div>';

        html += '<section class="session-section">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px;">';
        html += '<span class="mode-switch" aria-label="' + esc(t('ses.groupModeAria')) + '">';
        html += '<button type="button" class="' + (groupMode === 'folder' ? 'active' : '') + '" data-action="session-group-mode" data-mode="folder">' + t('ses.byFolder') + '</button>';
        html += '<button type="button" class="' + (groupMode === 'source' ? 'active' : '') + '" data-action="session-group-mode" data-mode="source">' + t('ses.bySource') + '</button>';
        html += '</span>';
        html += '<button class="btn" data-action="refresh-sessions">' + t('act.refresh') + '</button>';
        html += '</div>';
        html += '<div class="session-inbox">';
        html += '<aside class="session-source-rail" aria-label="' + esc(t('ses.groupAria')) + '">';
        html += '<div class="session-source-label">' + (groupMode === 'source' ? t('ses.source') : t('ses.folder')) + '</div>';
        groups.forEach(function(g) {
          var latest = g.sessions && g.sessions[0];
          var preview = latest ? sessionBodyPreview(latest, sessionTitleText(latest)) : '';
          html += '<button type="button" class="session-source-chip' + (g.key === activeGroupKey ? ' active' : '') + '" data-action="select-session-group" data-group-key="' + esc(g.key) + '" title="' + esc(g.key) + '">';
          html += '<span class="session-source-name">' + esc(g.name) + '</span><span class="session-source-count">' + g.count + '</span>';
          if (preview) html += '<span class="folder-hover-preview">' + esc(truncate(preview, 150)) + '</span>';
          html += '</button>';
        });
        html += '</aside>';
        html += '<div class="session-inbox-main">';
        html += '<div class="session-inbox-head"><div><div class="session-inbox-title">' + esc(activeGroup ? activeGroup.name : t('ses.allSessions')) + '</div><div class="session-inbox-note">' + visibleItems.length + ' ' + t('ses.unitSessions') + ' · ' + ((activeGroup && activeGroup.observations) || 0) + ' ' + t('ses.unitRecords') + '</div></div></div>';
        if (!visibleItems.length) {
          html += '<div class="session-empty-filter">' + (groupMode === 'source' ? t('ses.emptySource') : t('ses.emptyFolder')) + '</div>';
        } else {
          visibleItems.forEach(function(s) {
            var id = sessionId(s);
            var title = sessionTitleText(s);
            var preview = sessionBodyPreview(s, title) || t('ses.noPreview');
            var source = inferSessionSource(s);
            var avatarLabel = (source.name || t('ses.avatarFallback')).replace(/\s+/g, '').slice(0, 2);
            var selected = id && state.sessions.selectedId === id;
            html += '<button type="button" class="session-row' + (selected ? ' selected' : '') + '" data-action="select-session" data-session-id="' + esc(id || '') + '">';
            html += '<span class="session-row-avatar" aria-hidden="true">' + esc(avatarLabel || t('ses.avatarFallback')) + '</span>';
            html += '<div>';
            html += '<div class="session-row-title">' + esc(title || t('dash.unnamedSession')) + '</div>';
            html += '<div class="session-row-preview">' + esc(preview) + '</div>';
            html += '<div class="session-row-meta"><span>' + esc(source.name || t('ses.localRecord')) + '</span><span>' + esc(projectDisplayName(sessionProjectKey(s))) + '</span></div>';
            html += '</div>';
            html += '<div class="session-row-side"><span>' + esc(shortDateTime(sessionRecordTime(s))) + '</span><span class="session-row-count">' + (s.observationCount || 0) + ' ' + t('ses.recordsUnit') + '</span></div>';
            html += '</button>';
          });
        }
        html += '</div></div>';
        html += '</section>';
      }
      html += '</div>';
      el.innerHTML = html;

      if (state.sessions.selectedId) renderSessionDetail();
    }

    function selectSession(id) {
      state.sessions.selectedId = id;
      renderSessions();
      setTimeout(function() {
        var panel = document.getElementById('session-detail');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }

    var SESSION_HIGHLIGHT_LABELS = {
      goal: '用户',
      agent_output: 'Agent',
      tool: '工具',
      mcp: 'MCP',
      command: '命令',
      failure: '失败',
      validation: '验证',
      file: '文件',
      artifact: '产物',
      skill: 'Skill',
      todo: '待办',
      follow_up: '后续'
    };

    function sessionHighlightCacheKey(s) {
      if (!s) return '';
      return [
        sessionId(s),
        s.status || '',
        s.observationCount || 0,
        s.updatedAt || '',
        s.endedAt || '',
        s.startedAt || ''
      ].join('|');
    }

    function pruneSessionHighlightCache(items) {
      var keep = {};
      (items || []).forEach(function(s) {
        var id = sessionId(s);
        if (id) keep[id] = sessionHighlightCacheKey(s);
      });
      Object.keys(state.sessions.highlightsById || {}).forEach(function(id) {
        if (!keep[id] || state.sessions.highlightsById[id].cacheKey !== keep[id]) {
          delete state.sessions.highlightsById[id];
        }
      });
    }

    function pruneSessionDetailCache(items) {
      var keep = {};
      (items || []).forEach(function(s) {
        var id = sessionId(s);
        if (id) keep[id] = sessionHighlightCacheKey(s);
      });
      Object.keys(state.sessions.detailCacheById || {}).forEach(function(id) {
        if (!keep[id] || state.sessions.detailCacheById[id].cacheKey !== keep[id]) {
          delete state.sessions.detailCacheById[id];
        }
      });
    }

    function sessionDetailSections(id) {
      if (!state.sessions.detailSectionsById) state.sessions.detailSectionsById = {};
      if (!state.sessions.detailSectionsById[id]) {
        state.sessions.detailSectionsById[id] = { highlights: true, process: false };
      }
      return state.sessions.detailSectionsById[id];
    }

    function renderSessionSectionTitle(sessionIdValue, section, title, expanded) {
      return '<div class="card-title" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
        '<span>' + esc(title) + '</span>' +
        '<button type="button" class="btn" style="padding:4px 8px;font-size:11px;" data-action="toggle-session-detail-section" data-session-id="' + esc(sessionIdValue) + '" data-section="' + esc(section) + '" aria-expanded="' + (expanded ? 'true' : 'false') + '">' + (expanded ? '收起' : '展开') + '</button>' +
      '</div>';
    }

    function toggleSessionDetailSection(id, section) {
      if (!id || (section !== 'highlights' && section !== 'process')) return;
      var sections = sessionDetailSections(id);
      sections[section] = !sections[section];
      renderSessionDetail({ useCacheOnly: true });
    }

    async function getSessionHighlights(id, sessionRecord) {
      if (!id) return { ok: false, highlights: [] };
      var cacheKey = sessionHighlightCacheKey(sessionRecord);
      var cached = state.sessions.highlightsById[id];
      if (cached && cached.cacheKey === cacheKey) return cached;
      var result = await apiGet('session/highlights?sessionId=' + encodeURIComponent(id) + '&maxItems=12');
      var view = result && result.success === true && Array.isArray(result.highlights)
        ? { ok: true, highlights: result.highlights, cacheKey: cacheKey }
        : { ok: false, highlights: [], cacheKey: cacheKey };
      state.sessions.highlightsById[id] = view;
      return view;
    }

    function sessionDialogueHighlights(view) {
      return (Array.isArray(view && view.highlights) ? view.highlights : []).filter(function(item) {
        return item && (item.category === 'goal' || item.category === 'agent_output');
      });
    }

    function renderSessionHighlights(sessionIdValue, view, expanded) {
      var html = '<div class="card" style="margin-bottom:12px;" data-section="highlights">';
      html += renderSessionSectionTitle(sessionIdValue, 'highlights', '会话重点', expanded);
      if (!expanded) return html + '</div>';
      if (!view || view.ok === false) {
        html += '<div style="font-size:13px;color:var(--ink-faint);margin-top:8px;">会话重点暂不可用</div></div>';
        return html;
      }
      var highlights = sessionDialogueHighlights(view);
      if (highlights.length === 0) {
        html += '<div style="font-size:13px;color:var(--ink-faint);margin-top:8px;">暂无会话重点</div></div>';
        return html;
      }
      var compactHighlights = highlights.length > 4;
      html += '<div class="session-highlights-list' + (compactHighlights ? ' compact' : '') + '" style="display:grid;gap:10px;margin-top:10px;">';
      highlights.forEach(function(item) {
        var label = SESSION_HIGHLIGHT_LABELS[item.category] || item.category || '重点';
        html += '<div style="display:grid;grid-template-columns:82px 1fr;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-light);">';
        html += '<div><span class="badge badge-muted" style="font-size:10px;padding:3px 8px;">' + esc(label) + '</span></div>';
        html += '<div style="min-width:0;">';
        html += '<div style="font-size:14px;color:var(--ink);font-weight:600;line-height:1.35;white-space:pre-wrap;overflow-wrap:anywhere;">' + esc(item.title || label) + '</div>';
        if (item.summary) html += '<div class="md-body" style="font-size:13px;color:var(--ink-muted);line-height:1.45;margin-top:3px;overflow-wrap:anywhere;">' + renderMarkdownSafe(item.summary) + '</div>';
        html += '</div></div>';
      });
      html += '</div>';
      if (compactHighlights) {
        html += '<div style="margin-top:8px;font-size:12px;color:var(--ink-faint);">仅展示前几条重点；需要完整内容时使用完整对话过程。</div>';
      }
      html += '</div>';
      return html;
    }

    function isSessionPreviewExpanded(id) {
      return !!(state.sessions.previewExpandedById && state.sessions.previewExpandedById[id]);
    }

    function toggleSessionPreview(id) {
      if (!id) return;
      if (!state.sessions.previewExpandedById) state.sessions.previewExpandedById = {};
      state.sessions.previewExpandedById[id] = !state.sessions.previewExpandedById[id];
      renderSessionDetail({ useCacheOnly: true });
    }

    async function renderSessionDetail(options) {
      options = options || {};
      var panel = document.getElementById('session-detail');
      if (!panel) return;
      var s = state.sessions.items.find(function(x) { return sessionId(x) === state.sessions.selectedId; });
      var id = sessionId(s);
      if (!s || !id) { panel.innerHTML = ''; return; }

      var cacheKey = sessionHighlightCacheKey(s);
      var cachedDetail = state.sessions.detailCacheById && state.sessions.detailCacheById[id];
      var hasFreshCache = cachedDetail && cachedDetail.cacheKey === cacheKey;
      var obs;
      var highlightsView;
      if (hasFreshCache) {
        obs = cachedDetail.observations || [];
        highlightsView = cachedDetail.highlightsView || { ok: false, highlights: [], cacheKey: cacheKey };
      } else if (options.useCacheOnly) {
        return;
      } else {
        var detailRequestSeq = (state.sessions.detailRequestSeq || 0) + 1;
        state.sessions.detailRequestSeq = detailRequestSeq;
        if (!panel.innerHTML) panel.innerHTML = '<div class="detail-panel"><h3>加载会话详情中…</h3></div>';
        obs = [];
        if (!Array.isArray(s.embeddedObservations) || String(s.id || '').indexOf('browser_sync_') >= 0 || !s.id) {
          obs = Array.isArray(s.embeddedObservations) ? s.embeddedObservations : [];
        }
        if (!obs.length && id) {
          var obsRes = await apiGet('observations?sessionId=' + encodeURIComponent(id));
          obs = (obsRes && obsRes.observations) || [];
        }
        if ((!obs || obs.length === 0) && Array.isArray(s.embeddedObservations)) {
          obs = s.embeddedObservations;
        }
        if ((!obs || obs.length === 0) && String(s.source || '').indexOf('local-') === 0) {
          var localRes = await apiGet('local-agent-session-events?sessionId=' + encodeURIComponent(id));
          obs = (localRes && localRes.observations) || obs || [];
        }
        highlightsView = await getSessionHighlights(id, s);
        if (state.sessions.detailRequestSeq !== detailRequestSeq || state.sessions.selectedId !== id) return;
        state.sessions.detailCacheById[id] = {
          cacheKey: cacheKey,
          observations: obs || [],
          highlightsView: highlightsView,
        };
      }

      var typeCounts = {};
      var toolCounts = {};
      var fileSet = new Set();
      var firstPromptFromObs = '';
      obs.forEach(function(o) {
        var t = o.type || o.hookType || 'other';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
        var tool = o.title || o.toolName;
        if (tool && t !== 'conversation') toolCounts[tool] = (toolCounts[tool] || 0) + 1;
        (o.files || []).forEach(function(f) { fileSet.add(f); });
        if (!firstPromptFromObs && (o.userPrompt || (o.type === 'conversation' && o.narrative))) {
          firstPromptFromObs = o.userPrompt || o.narrative || '';
        }
      });

      var durationMs = s.endedAt ? new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime() : 0;
      var durationLabel = durationMs > 0 ? (durationMs < 60000 ? (durationMs / 1000).toFixed(1) + 's' : (durationMs / 60000).toFixed(1) + 'm') : '-';

      var detailTitle = sessionTitleText(s);
      var preview = sessionBodyPreview({ summary: s.summary, latestPrompt: firstPromptFromObs, firstPrompt: s.firstPrompt }, detailTitle) || firstPromptFromObs || s.summary || s.firstPrompt || '';
      var detailSections = sessionDetailSections(id);

      var html = '<div class="detail-panel" id="session-detail-top">';
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">';
      html += '<div><h3 style="margin:0;">会话时间线</h3><div style="font-size:12px;color:var(--ink-muted);margin-top:4px;">' + esc(projectDisplayName(sessionProjectKey(s))) + ' · ' + esc(shortDateTime(sessionRecordTime(s))) + '</div></div>';
      html += statusIconMarkup(s.status, sessionStatusLabel(s.status));
      html += '</div>';

      if (preview) {
        var previewExpanded = isSessionPreviewExpanded(id);
        var previewIsLong = String(preview).length > 260;
        html += '<div class="session-detail-preview' + (!previewExpanded && previewIsLong ? ' compact' : '') + '">' + esc(preview) + '</div>';
        if (previewIsLong) {
          html += '<button type="button" class="btn" style="padding:4px 8px;font-size:11px;margin:-4px 0 12px;" data-action="toggle-session-preview" data-session-id="' + esc(id) + '">' + (previewExpanded ? '收起摘要' : '展开摘要') + '</button>';
        }
      }

      html += '<div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;margin-bottom:14px;">';
      html += '<div class="card" style="padding:10px;"><div style="font-size:10px;letter-spacing:0.08em;color:var(--ink-muted);">记录</div><div style="font-size:20px;font-weight:600;">' + obs.length + '</div></div>';
      html += '<div class="card" style="padding:10px;"><div style="font-size:10px;letter-spacing:0.08em;color:var(--ink-muted);">操作类型</div><div style="font-size:20px;font-weight:600;">' + Object.keys(typeCounts).length + '</div></div>';
      html += '<div class="card" style="padding:10px;"><div style="font-size:10px;letter-spacing:0.08em;color:var(--ink-muted);">文件</div><div style="font-size:20px;font-weight:600;">' + fileSet.size + '</div></div>';
      html += '<div class="card" style="padding:10px;"><div style="font-size:10px;letter-spacing:0.08em;color:var(--ink-muted);">时长</div><div style="font-size:20px;font-weight:600;">' + esc(durationLabel) + '</div></div>';
      html += '</div>';

      html += renderSessionHighlights(id, highlightsView, detailSections.highlights !== false);

      var timelineObs = obs.slice().sort(function(a, b) { return (a.timestamp || '').localeCompare(b.timestamp || ''); });
      var processExpanded = detailSections.process === true;
      var isLongTimeline = timelineObs.length > 80;
      html += '<div class="card" style="margin-bottom:12px;" data-section="process">';
      html += renderSessionSectionTitle(id, 'process', '完整对话过程 · ' + timelineObs.length + ' 条', processExpanded);
      if (processExpanded && isLongTimeline) {
        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:8px;"><div style="font-size:12px;color:var(--ink-muted);">记录很多，可以先跳到底部看最近进展。</div><button class="btn" data-action="session-jump" data-target="bottom">跳到底部</button></div>';
      }
      if (processExpanded && timelineObs.length === 0) {
        html += '<div style="font-size:13px;color:var(--ink-faint);margin-top:8px;">这段会话还没有可展示的过程记录。</div>';
      } else if (processExpanded) {
        html += '<div style="display:grid;gap:8px;margin-top:10px;">';
        timelineObs.forEach(function(o) {
          var display = observationDisplay(o);
          var type = o.type || o.hookType || 'other';
          html += '<div' + (o && o.id ? ' id="obs-anchor-' + esc(o.id) + '"' : '') + ' style="display:grid;grid-template-columns:72px 1fr;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-light);">';
          html += '<div style="font-size:12px;color:var(--ink-faint);font-family:var(--font-ui);">' + esc(shortTime(o.timestamp)) + '</div>';
          html += '<div><div style="font-size:14px;color:var(--ink);font-weight:600;line-height:1.35;white-space:pre-wrap;">' + esc(display.title || observationTypeLabel(type)) + '</div>';
          if (display.body) html += '<div class="md-body" style="font-size:13px;color:var(--ink-muted);line-height:1.45;margin-top:3px;overflow-wrap:anywhere;">' + renderMarkdownSafe(display.body) + '</div>';
          html += '</div></div>';
        });
        html += '</div>';
        if (isLongTimeline) html += '<div id="session-detail-bottom" style="display:flex;justify-content:flex-end;margin-top:10px;"><button class="btn" data-action="session-jump" data-target="top">回到顶部</button></div>';
      }
      html += '</div>';

      var topTools = Object.keys(toolCounts).sort(function(a, b) { return toolCounts[b] - toolCounts[a]; }).slice(0, 10);
      if (topTools.length > 0) {
        var maxC = toolCounts[topTools[0]] || 1;
        html += '<div class="card" style="margin-bottom:12px;"><div class="card-title">工具使用</div>';
        html += '<div class="bar-chart" style="margin-top:8px;">';
        topTools.forEach(function(t) {
          var pct = Math.round((toolCounts[t] / maxC) * 100);
          html += '<div class="bar-row"><span class="bar-label" style="font-family:var(--font-mono);">' + esc(t) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:var(--accent);"></div></div><span class="bar-value">' + toolCounts[t] + '</span></div>';
        });
        html += '</div></div>';
      }

      var typeKeys = Object.keys(typeCounts).sort(function(a, b) { return typeCounts[b] - typeCounts[a]; });
      if (typeKeys.length > 0) {
        html += '<div class="card" style="margin-bottom:12px;"><div class="card-title">记录类型</div>';
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">';
        typeKeys.forEach(function(t) {
          html += '<span class="badge badge-muted">' + esc(typeDisplayLabel(t)) + ' · ' + typeCounts[t] + '</span>';
        });
        html += '</div></div>';
      }

      if (fileSet.size > 0) {
        var filesArr = Array.from(fileSet).slice(0, 30);
        html += '<div class="card" style="margin-bottom:12px;"><div class="card-title">文件</div>';
        html += '<div style="font-size:12px;font-family:var(--font-mono);line-height:1.6;margin-top:8px;">';
        filesArr.forEach(function(f) { html += '<div>&#8226; ' + esc(f) + '</div>'; });
        if (fileSet.size > 30) html += '<div style="color:var(--ink-faint);">+' + (fileSet.size - 30) + ' more</div>';
        html += '</div></div>';
      }

      var detailId = sessionId(s);
      html += '<div class="card" style="margin-bottom:12px;"><div class="card-title">记录来源</div>';
      html += '<div class="memory-card-grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-top:10px;">';
      sessionSourceSummary(s, obs.length).forEach(function(item) {
        html += '<div class="action-overview-card" style="padding:10px;"><div class="action-overview-label">' + esc(item.label) + '</div><div style="font-size:13px;color:var(--ink);line-height:1.35;margin-top:4px;overflow-wrap:anywhere;">' + esc(item.value || '-') + '</div></div>';
      });
      html += '</div>';
      html += '<details style="margin-top:10px;font-size:12px;color:var(--ink-muted);"><summary style="cursor:pointer;">查看技术细节</summary>';
      html += '<div style="font-family:var(--font-mono);margin-top:8px;line-height:1.7;">';
      html += '<div><span style="color:var(--ink-muted);">id:</span> ' + esc(detailId || '无记录 ID') + '</div>';
      html += '<div><span style="color:var(--ink-muted);">path:</span> ' + esc(s.cwd || '-') + '</div>';
      html += '<div><span style="color:var(--ink-muted);">started:</span> ' + esc(formatTime(s.startedAt)) + '</div>';
      if (s.endedAt) html += '<div><span style="color:var(--ink-muted);">ended:</span> ' + esc(formatTime(s.endedAt)) + '</div>';
      if (s.model) html += '<div><span style="color:var(--ink-muted);">model:</span> ' + esc(s.model) + '</div>';
      if (s.tags && s.tags.length) html += '<div><span style="color:var(--ink-muted);">tags:</span> ' + s.tags.map(esc).join(', ') + '</div>';
      html += '</div></details></div>';

      html += '<div style="display:flex;gap:8px;">';
      if (detailId) {
        html += '<button class="btn btn-primary" data-action="summarize-session" data-session-id="' + esc(detailId) + '">生成摘要</button>';
      } else {
        html += '<button class="btn btn-primary" disabled>暂不能整理</button>';
      }
      html += '</div></div>';
      panel.innerHTML = html;
      applyPendingHighlight();
    }

    async function endSession(id) {
      await apiPost('session/end', { sessionId: id });
      state.sessions.loaded = false;
      loadSessions({ showLoading: true, reason: 'manual' });
    }

    async function summarizeSession(id, btn) {
      if (!btn) return;
      btn.textContent = '生成中...';
      btn.disabled = true;
      try {
        var result = await apiPost('summarize', { sessionId: id });
        state.lessons.loaded = false;
        if (result && result.success) {
          btn.textContent = result.fallback ? '已生成本地摘要' : '已生成摘要';
          btn.title = result.fallback ? '没有可用模型时，已用本地规则从会话记录生成摘要。' : '';
        } else {
          btn.textContent = summarizeErrorLabel(result && (result.reason || result.error));
          btn.title = summarizeErrorHint(result && (result.reason || result.error));
        }
      } catch (err) {
        btn.textContent = '摘要服务未响应';
        btn.title = '本地工作台没有连上摘要接口，请确认 AI Todo worker 正在运行。';
      }
      setTimeout(function() { btn.textContent = '生成摘要'; btn.disabled = false; }, 2600);
    }

    function summarizeErrorLabel(error) {
      if (error === 'no_observations') return '暂无可摘要内容';
      if (error === 'session_not_found') return '会话不存在';
      if (error === 'no_provider') return '缺少模型配置';
      return '生成失败';
    }

    function summarizeErrorHint(error) {
      if (error === 'no_observations') return '这段会话还没有可整理的记录。';
      if (error === 'session_not_found') return '本地数据里没有找到这段会话。';
      if (error === 'no_provider') return '未配置模型时会使用本地规则摘要；如果仍失败，请检查本地 worker 日志。';
      return String(error || '摘要生成失败，请稍后重试。');
    }

    function skillDraftSlug(text) {
      var base = String(text || 'skill').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '');
      return (base || 'memory-skill').slice(0, 48);
    }
    function skillDraftTitle(groupKey) {
      var name = projectDisplayName(groupKey || '通用经验');
      return name === '通用经验' ? '可复用工作流 Skill' : name + ' 工作流 Skill';
    }
    function buildSkillDraft(groupKey, lessons) {
      var list = (lessons || []).slice().sort(function(a, b) { return (b.confidence || 0) - (a.confidence || 0); }).slice(0, 8);
      var title = skillDraftTitle(groupKey);
      var slug = skillDraftSlug(groupKey || title);
      var tags = [];
      list.forEach(function(l) { (l.tags || []).forEach(function(t) { if (tags.indexOf(t) < 0) tags.push(t); }); });
      var lines = [];
      lines.push('# ' + title);
      lines.push('');
      lines.push('## When to use');
      lines.push('Use this skill when the user is working on ' + projectDisplayName(groupKey || 'a reusable workflow') + ' and needs the agent to apply the repeated lessons below.');
      lines.push('');
      lines.push('## Core lessons');
      if (!list.length) lines.push('- Add confirmed lessons here before installing this skill.');
      list.forEach(function(l) { lines.push('- ' + translateLessonText(l.content)); });
      lines.push('');
      lines.push('## Operating guidance');
      lines.push('- Preserve the user-visible product intent before changing implementation details.');
      lines.push('- Prefer reviewable drafts over automatic writes when the output changes durable memory or local skills.');
      lines.push('- Keep examples, docs, and product UI aligned after every meaningful change.');
      if (tags.length) {
        lines.push('');
        lines.push('## Tags');
        lines.push(tags.slice(0, 10).map(function(t) { return '`' + t + '`'; }).join(' '));
      }
      lines.push('');
      lines.push('## Suggested install path');
      lines.push('`~/.codex/skills/' + slug + '/SKILL.md`');
      return lines.join('\n');
    }
    function openSkillDraft(groupKey) {
      var lessons = (state.lessons.items || []).filter(function(l) {
        var key = l.project || (l.tags && l.tags[0]) || '通用经验';
        return key === groupKey;
      });
      var draft = buildSkillDraft(groupKey, lessons);
      var modal = document.getElementById('modal');
      var overlay = document.getElementById('modal-overlay');
      modal.innerHTML =
        '<h3>Skill 草稿</h3>' +
        '<p>这是从已确认经验生成的草稿，不会自动写入本地 Skill。确认适合长期复用后，再复制到对应 Skill 目录。</p>' +
        '<pre id="skill-draft-preview" class="skill-draft-preview">' + esc(draft) + '</pre>' +
        '<div class="modal-actions"><button class="btn" data-action="close-modal">关闭</button><button class="btn btn-primary" data-action="copy-skill-draft">复制草稿</button></div>';
      overlay.classList.add('open');
    }

    function openAddLesson() {
      var modal = document.getElementById('modal');
      var overlay = document.getElementById('modal-overlay');
      var projectOptions = '<option value="">全部项目</option>';
      (state.lessons.projects || []).forEach(function(projectKey) {
        projectOptions += '<option value="' + esc(projectKey) + '">' + esc(projectDisplayName(projectKey)) + '</option>';
      });
      modal.innerHTML =
        '<h3>创建经验</h3>' +
        '<p>写下一条以后可以复用、也可能沉淀进本地 Skill 的做法。</p>' +
        '<div class="memory-add-form">' +
        '<label>经验<textarea id="add-lesson-content" rows="6" placeholder="例如：会话页应该像工作档案，而不是聊天记录列表。"></textarea></label>' +
        '<label>适用场景<textarea id="add-lesson-context" rows="3" placeholder="例如：设计记忆产品、会话回放、面向非技术用户的界面时。"></textarea></label>' +
        '<div class="memory-add-grid">' +
        '<label>标签<input id="add-lesson-tags" placeholder="ui, skill, memory-product"></label>' +
        '<label>项目<select id="add-lesson-project">' + projectOptions + '</select><span style="display:block;margin-top:6px;font-size:12px;color:var(--ink-muted);">选择全部项目时，这条经验会作为通用经验保存。</span></label>' +
        '</div>' +
        '<div id="add-lesson-error" class="memory-form-error"></div>' +
        '</div>' +
        '<div class="modal-actions"><button class="btn" data-action="close-modal">取消</button><button class="btn btn-primary" data-action="save-new-lesson">保存</button></div>';
      overlay.classList.add('open');
      setTimeout(function() {
        var input = document.getElementById('add-lesson-content');
        if (input) input.focus();
      }, 0);
    }

    async function saveNewLesson() {
      var err = document.getElementById('add-lesson-error');
      var content = (document.getElementById('add-lesson-content') || {}).value || '';
      var context = (document.getElementById('add-lesson-context') || {}).value || '';
      var tags = (document.getElementById('add-lesson-tags') || {}).value || '';
      var project = (document.getElementById('add-lesson-project') || {}).value || '';
      if (!content.trim()) {
        if (err) {
          err.style.display = 'block';
          err.textContent = '先写一条经验再保存。';
        }
        return;
      }
      var result = await apiPost('lessons', {
        content: content.trim(),
        context: context.trim(),
        tags: tags.split(',').map(function(t) { return t.trim(); }).filter(Boolean),
        project: project.trim() || undefined,
        confidence: 0.85
      });
      if (!result || result.error) {
        if (err) {
          err.style.display = 'block';
          err.textContent = (result && result.error) || '保存失败，请稍后再试。';
        }
        return;
      }
      closeModal();
      state.lessons.loaded = false;
      await loadLessons();
    }

    async function openSkillDetail(path) {
      var modal = document.getElementById('modal');
      var overlay = document.getElementById('modal-overlay');
      modal.innerHTML = '<h3>Skill 详情</h3><p>正在读取本地 SKILL.md...</p><div class="modal-actions"><button class="btn" data-action="close-modal">关闭</button></div>';
      overlay.classList.add('open');
      var detail = await apiGet('local-skill-detail?path=' + encodeURIComponent(path || ''));
      if (!detail || detail.error) {
        modal.innerHTML = '<h3>Skill 详情</h3><p>' + esc((detail && detail.error) || '读取失败') + '</p><div class="modal-actions"><button class="btn" data-action="close-modal">关闭</button></div>';
        return;
      }
      var html = '<h3>' + esc(detail.name || 'Skill') + '</h3>';
      if (detail.description) html += '<p>' + esc(detail.description) + '</p>';
      html += '<div class="card" style="margin:12px 0;padding:12px;">';
      html += '<div style="font-size:12px;line-height:1.7;color:var(--ink-muted);">';
      html += '<div><strong style="color:var(--ink);">来源文件</strong><br><span style="font-family:var(--font-mono);overflow-wrap:anywhere;">' + esc(detail.path || '') + '</span></div>';
      html += '<div style="margin-top:8px;"><strong style="color:var(--ink);">最近修改</strong><br>' + esc(formatTime(detail.updatedAt)) + '</div>';
      if (detail.argumentHint) html += '<div style="margin-top:8px;"><strong style="color:var(--ink);">参数提示</strong><br>' + esc(detail.argumentHint) + '</div>';
      html += '</div></div>';
      if (detail.headings && detail.headings.length) {
        html += '<div class="card" style="margin:12px 0;padding:12px;"><div class="card-title">结构</div><div class="tag-list">';
        detail.headings.forEach(function(h) { html += '<span class="tag">' + esc(h) + '</span>'; });
        html += '</div></div>';
      }
      html += '<div class="card" style="margin:12px 0;padding:12px;max-height:320px;overflow:auto;">';
      html += '<div class="card-title">内容预览</div>';
      html += '<pre style="white-space:pre-wrap;font-family:var(--font-mono);font-size:12px;line-height:1.55;color:var(--ink-secondary);margin:10px 0 0;">' + esc(detail.preview || '暂无内容') + '</pre>';
      html += '</div>';
      html += '<div class="modal-actions"><button class="btn" data-action="copy-skill-path" data-skill-path="' + esc(detail.path || path || '') + '">复制路径</button><button class="btn btn-primary" data-action="close-modal">关闭</button></div>';
      modal.innerHTML = html;
    }

    async function loadLessons() {
      var el = document.getElementById('view-lessons');
      el.innerHTML = '<div class="loading">正在加载经验...</div>';
      var results = await Promise.all([apiGet('lessons?minConfidence=0.5'), apiGet('sessions')]);
      var explicitLessons = (results[0] && results[0].lessons) || [];
      var sessions = (results[1] && results[1].sessions) || [];
      var projects = {};
      sessions.forEach(function(s) {
        var key = sessionProjectKey(s);
        if (key) projects[key] = true;
      });
      state.lessons.items = explicitLessons;
      state.lessons.projects = Object.keys(projects).sort(function(a, b) { return projectDisplayName(a).localeCompare(projectDisplayName(b)); });
      state.lessons.mode = explicitLessons.length ? 'explicit' : 'empty';
      state.lessons.loaded = true;
      renderLessons();
    }

    function renderLessons() {
      var el = document.getElementById('view-lessons');
      var items = state.lessons.items;
      var search = state.lessons.search.toLowerCase();

      if (search) {
        items = items.filter(function(l) {
          return (l.content + ' ' + l.context + ' ' + (l.tags || []).join(' ')).toLowerCase().indexOf(search) >= 0;
        });
      }

      var groups = {};
      items.forEach(function(l) {
        var tags = (l.tags || []).filter(Boolean);
        var key = tags[0] || l.project || '通用工作方式';
        if (!groups[key]) groups[key] = [];
        groups[key].push(l);
      });
      var groupKeys = Object.keys(groups).sort(function(a, b) { return groups[b].length - groups[a].length; });

      var skillQuery = String(state.lessons.skillSearch || '').trim().toLowerCase();
      var skillRootFilter = state.lessons.skillRootFilter || 'all';
      function skillMatches(skill) {
        var rootOk = skillRootFilter === 'all' || String(skill.root || '') === skillRootFilter;
        if (!rootOk) return false;
        if (!skillQuery) return true;
        return String(skill.name || '').toLowerCase().indexOf(skillQuery) >= 0 || String(skill.path || '').toLowerCase().indexOf(skillQuery) >= 0 || String(skill.root || '').toLowerCase().indexOf(skillQuery) >= 0;
      }
      function skillRootMeta(root) {
        var known = {
          Codex: { title: 'Codex 环境', sub: '这个 agent 会加载' },
          Agents: { title: '共享目录', sub: '多个 agent 可复用' },
          Plugin: { title: '插件提供', sub: '随插件一起安装' }
        };
        return known[root] || { title: root || '其他来源', sub: '自定义 agent / skill 目录' };
      }
      var rootOrder = { Codex: 1, Agents: 2, Plugin: 99 };
      var allSkillRoots = Array.from(new Set((LOCAL_SKILLS || []).map(function(skill) { return skill.root || '其他'; }))).sort(function(a, b) {
        return (rootOrder[a] || 50) - (rootOrder[b] || 50) || a.localeCompare(b);
      });
      var visibleSkills = (LOCAL_SKILLS || []).filter(skillMatches);
      var skillGroups = {};
      visibleSkills.forEach(function(skill) {
        if (!skillGroups[skill.root]) skillGroups[skill.root] = [];
        skillGroups[skill.root].push(skill);
      });
      var skillRoots = Object.keys(skillGroups).sort(function(a, b) {
        return (rootOrder[a] || 50) - (rootOrder[b] || 50) || a.localeCompare(b);
      });

      var html = '<div class="lesson-workshop">';
      html += '<div class="lesson-workshop-head">';
      html += '<div><div class="lesson-workshop-title">本地 Skill 管理台</div>';
      html += '<div class="lesson-workshop-sub">先看已经安装的能力，再决定哪些经验值得沉淀进去。</div></div>';
      html += '<div class="lesson-head-actions"><div class="lesson-count-pill">' + (LOCAL_SKILLS || []).length + ' 个 Skill</div>';
      html += '<button class="btn btn-primary add-lesson-btn" data-action="open-add-lesson" aria-label="创建经验">';
      html += '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
      html += '创建经验</button></div>';
      html += '</div>';

      html += '<div class="skill-console-summary">';
      html += '<div class="skill-console-stat"><span class="skill-console-stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"></path><path d="M8 9h8M8 13h5"></path></svg></span><div><div class="skill-console-stat-value">' + (LOCAL_SKILLS || []).length + '</div><div class="skill-console-stat-label">已安装 Skill</div></div></div>';
      html += '<div class="skill-console-stat"><span class="skill-console-stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18"></path><path d="M6 7v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"></path><path d="M9 4h6"></path></svg></span><div><div class="skill-console-stat-value">' + allSkillRoots.length + '</div><div class="skill-console-stat-label">来源目录</div></div></div>';
      html += '<div class="skill-console-stat"><span class="skill-console-stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M8.5 14a6 6 0 1 1 7 0c-.8.6-1.2 1.3-1.4 2h-4.2c-.2-.7-.6-1.4-1.4-2Z"></path></svg></span><div><div class="skill-console-stat-value">' + items.length + '</div><div class="skill-console-stat-label">待沉淀经验</div></div></div>';
      html += '</div>';

      html += '<div class="skill-filter-row">';
      html += '<button class="skill-filter-btn' + (skillRootFilter === 'all' ? ' active' : '') + '" data-action="filter-skill-root" data-root="all"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>全部</button>';
      allSkillRoots.forEach(function(root) {
        var meta = skillRootMeta(root);
        html += '<button class="skill-filter-btn' + (skillRootFilter === root ? ' active' : '') + '" data-action="filter-skill-root" data-root="' + esc(root) + '"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18"></path><path d="M5 7v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7"></path><path d="M9 4h6"></path></svg>' + esc(meta.title) + '</button>';
      });
      html += '</div>';

      html += '<div style="display:flex;gap:8px;align-items:center;">';
      html += '<input id="skills-search" class="search-input" type="text" placeholder="搜索 Skill 名称或路径..." value="' + esc(state.lessons.skillSearch) + '" style="flex:1" />';
      html += '</div>';

      html += '<div class="local-skill-grid">';
      if (skillRoots.length === 0) {
        html += '<div class="empty-state"><div class="empty-title">没有匹配的 Skill</div></div>';
      }
      skillRoots.forEach(function(root) {
        var list = (skillGroups[root] || []).slice();
        var meta = skillRootMeta(root);
        html += '<article class="local-skill-card">';
        html += '<div class="local-skill-head"><div><div class="local-skill-title">' + esc(meta.title) + '</div><div class="local-skill-sub">' + esc(meta.sub) + '</div></div><div class="skill-draft-count">' + list.length + '</div></div>';
        html += '<div class="local-skill-list">';
        list.forEach(function(skill) {
          html += '<div class="local-skill-row">';
          html += '<div style="min-width:0;"><div class="local-skill-name">' + esc(skill.name) + '</div><div class="local-skill-path" title="' + esc(skill.path) + '">' + esc(skill.path) + '</div></div>';
          html += '<div class="local-skill-row-actions"><button class="icon-btn" data-action="open-skill-detail" data-skill-path="' + esc(skill.path) + '" title="查看详情" aria-label="查看详情"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"></path><circle cx="12" cy="12" r="3"></circle></svg></button><button class="icon-btn" data-action="copy-skill-path" data-skill-path="' + esc(skill.path) + '" title="复制路径" aria-label="复制路径"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button></div>';
          html += '</div>';
        });
        html += '</div></article>';
      });
      html += '</div>';

      html += '<div class="lesson-section-head"><div><div class="lesson-workshop-title" style="font-size:16px;">可沉淀经验</div><div class="lesson-workshop-sub">这些是从工作里提炼出的规则，可以继续合并进某个本地 Skill。</div></div><div class="lesson-count-pill">' + items.length + ' 条经验</div></div>';

      html += '<div style="display:flex;gap:8px;align-items:center;">';
      html += '<input id="lessons-search" class="search-input" type="text" placeholder="搜索经验..." value="' + esc(state.lessons.search) + '" style="flex:1" />';
      html += '</div>';

      if (items.length === 0) {
        html += '<div class="empty-state">' +
          '<div class="empty-icon">&#128161;</div>' +
          '<div class="empty-title">还没有可沉淀的经验</div>' +
          '<div class="empty-lead">当某条做法被确认有复用价值，它会先进入这里，再决定是否写进某个本地 Skill。</div>' +
          '</div>';
      } else {
        html += '<div class="skill-draft-grid">';
        groupKeys.forEach(function(key) {
          var group = groups[key].slice().sort(function(a, b) { return (b.confidence || 0) - (a.confidence || 0); });
          html += '<article class="skill-draft-card">';
          html += '<div class="skill-draft-head"><div class="skill-draft-title">' + esc(key) + '</div><div class="skill-draft-count">' + group.length + ' 条</div></div>';
          html += '<ul class="skill-lesson-list">';
          group.slice(0, 4).forEach(function(l) {
            var lessonContent = translateLessonText(l.content);
            html += '<li>' + esc(truncate(lessonContent, 120)) + '</li>';
          });
          if (group.length > 4) html += '<li>还有 ' + (group.length - 4) + ' 条相近经验</li>';
          html += '</ul>';
          html += '<div class="skill-draft-actions"><button class="btn" data-action="open-skill-draft" data-skill-draft-key="' + esc(key) + '">生成草稿</button></div>';
          html += '</article>';
        });
        html += '</div>';
      }
      html += '</div>';

      var __focus = captureSearchFocus(['skills-search', 'lessons-search']);
      el.innerHTML = html;
      var __ss = document.getElementById('skills-search');
      if (__ss) bindImeSafeSearch(__ss, 200, function(v){ state.lessons.skillSearch = v; renderLessons(); });
      var __ls = document.getElementById('lessons-search');
      if (__ls) bindImeSafeSearch(__ls, 200, function(v){ state.lessons.search = v; renderLessons(); });
      restoreSearchFocus(__focus);
    }

    async function loadActions(opts) {
      opts = opts || {};
      var el = document.getElementById('view-actions');
      el.innerHTML = '<div class="loading">' + esc(t('act.extract.loading')) + '</div>';
      var results = await Promise.all([
        apiGet('actions'),
        apiGet('frontier'),
        apiGet('review?status=pending&kind=action&limit=200'),
        apiGet('inbox?status=awaiting&limit=50'),
        apiGet('inbox?status=answered&limit=50'),
        apiGet('inbox?status=dismissed&limit=50')
      ]);
      var explicitActions = (results[0] && results[0].actions) || [];
      var frontier = (results[1] && (results[1].frontier || results[1].actions)) || [];
      var reviewItems = ((results[2] && results[2].items) || []).filter(function(item) {
        return item && item.status === 'pending' && item.kind === 'action' && isActionReviewRenderable(item);
      });

      state.actions.items = explicitActions;
      state.actions.reviewItems = reviewItems;
      state.actions.frontier = frontier;
      state.actions.loaded = true;
      state.actions.stale = false;
      state.inbox.awaitingItems = (results[3] && results[3].items) || [];
      state.inbox.answeredItems = (results[4] && results[4].items) || [];
      state.inbox.dismissedItems = (results[5] && results[5].items) || [];
      state.inbox.items = state.inbox.awaitingItems;
      state.inbox.loaded = true;
      renderActions();
      if (state.settings.open) {
        loadTodoExtractorConfig().then(renderSettingsPanel).catch(function() {});
      }
      if (opts.generate === true) startTodoExtraction(opts.force === true);
    }

    function todoExtractionDelta(result) {
      if (!result || result.success !== true) return 0;
      return Number(result.directCreated || 0) + Number(result.reviewCreated || 0);
    }

    function todoExtractionSummary(result) {
      if (!result || result.success !== true) return t('act.extract.failedExisting');
      var delta = todoExtractionDelta(result);
      var hidden = Number(result.hiddenHistory || 0);
      var discarded = Number(result.discarded || 0);
      var cleaned = Number(result.cleanedActions || 0) + Number(result.cleanedReviews || 0);
      var engine = result.engine || 'rules';
      var prefix = engine === 'langextract' ? t('act.extract.doneLlm') : (engine === 'mixed' ? t('act.extract.doneMixed') : t('act.extract.doneRules'));
      var parts = [prefix, t('act.extract.created') + ' ' + delta, t('act.extract.history') + ' ' + hidden, t('act.extract.discarded') + ' ' + discarded];
      if (cleaned > 0) parts.push(t('act.extract.cleaned') + ' ' + cleaned);
      if (result.fallbackReason) parts.push(t('act.extract.reason') + ': ' + result.fallbackReason);
      return parts.join(' · ');
    }

    function todoExtractionUsedLlm(result) {
      return !!result && (result.engine === 'langextract' || result.engine === 'mixed') && !result.llmFallback;
    }

    function refreshActionListsAfterExtract() {
      return Promise.all([
        apiGet('actions'),
        apiGet('frontier'),
        apiGet('review?status=pending&kind=action&limit=200')
      ]).then(function(results) {
        state.actions.items = (results[0] && results[0].actions) || state.actions.items || [];
        state.actions.frontier = (results[1] && (results[1].frontier || results[1].actions)) || state.actions.frontier || [];
        state.actions.reviewItems = ((results[2] && results[2].items) || []).filter(function(item) {
          return item && item.status === 'pending' && item.kind === 'action' && isActionReviewRenderable(item);
        });
        return null;
      });
    }

    function actionsScrolledAway() {
      try {
        var y = window.pageYOffset ||
          (document.documentElement && document.documentElement.scrollTop) ||
          (document.body && document.body.scrollTop) ||
          0;
        return state.activeTab === 'actions' && y > 80;
      } catch (_) {
        return false;
      }
    }

    function loadTodoExtractorConfig() {
      return apiGet('config/todo-extractor').then(function(res) {
        if (res && res.config) state.actions.config = res;
        return res;
      });
    }

    function renderSettingsPanel() {
      var panel = document.getElementById('settings-panel');
      var gear = document.getElementById('settings-gear');
      if (!panel) return;
      if (gear) gear.setAttribute('aria-expanded', state.settings.open ? 'true' : 'false');
      panel.setAttribute('aria-hidden', state.settings.open ? 'false' : 'true');
      panel.classList.toggle('open', !!state.settings.open);
      if (!state.settings.open) {
        panel.innerHTML = '';
        return;
      }
      var cfg = (state.actions.config && state.actions.config.config) || {};
      var draft = state.actions.configDraft || {};
      var value = function(key, fallback) {
        if (Object.prototype.hasOwnProperty.call(draft, key)) return esc(draft[key] || '');
        return esc(cfg[key] || fallback || '');
      };
      var keyLabel = cfg.LANGEXTRACT_API_KEY_CONFIGURED ? t('settings.apiKeyKeep') : t('settings.apiKeyMissing');
      var maskedKey = cfg.LANGEXTRACT_API_KEY_MASKED || '';
      var html = '<div class="settings-head">';
      html += '<div><div class="settings-title">' + esc(t('settings.title')) + '</div><div class="settings-sub">' + esc(t('settings.subtitle')) + '</div></div>';
      html += '<button class="btn" data-action="close-settings" type="button">' + esc(t('settings.close')) + '</button>';
      html += '</div>';
      html += '<section class="settings-section"><div class="settings-section-title">' + esc(t('settings.language')) + '</div>';
      html += '<div class="settings-language">';
      html += '<button class="btn' + (I18N_LANG === 'zh' ? ' active' : '') + '" data-action="set-ui-language" data-lang="zh" type="button">中文</button>';
      html += '<button class="btn' + (I18N_LANG === 'en' ? ' active' : '') + '" data-action="set-ui-language" data-lang="en" type="button">English</button>';
      html += '</div></section>';
      html += '<section class="settings-section"><div class="settings-section-title">' + esc(t('settings.extractor')) + '</div>';
      html += '<div class="settings-grid">';
      html += '<input id="todo-config-AGENTMEMORY_TODO_EXTRACTOR" class="search-input" value="' + value('AGENTMEMORY_TODO_EXTRACTOR', 'auto') + '" placeholder="auto|rules|langextract" />';
      html += '<input id="todo-config-LANGEXTRACT_PYTHON" class="search-input" value="' + value('LANGEXTRACT_PYTHON', 'python3') + '" placeholder="python3" />';
      html += '<input id="todo-config-LANGEXTRACT_PROVIDER" class="search-input" value="' + value('LANGEXTRACT_PROVIDER', 'openai') + '" placeholder="openai" />';
      html += '<input id="todo-config-LANGEXTRACT_MODEL" class="search-input" value="' + value('LANGEXTRACT_MODEL', 'deepseek/deepseek-v4-pro') + '" placeholder="model" />';
      html += '<input id="todo-config-LANGEXTRACT_BASE_URL" class="search-input" value="' + value('LANGEXTRACT_BASE_URL', 'https://api.novita.ai/openai/v1') + '" placeholder="https://api.novita.ai/openai/v1" />';
      html += '<input id="todo-config-LANGEXTRACT_THINKING_DEPTH" class="search-input" value="' + value('LANGEXTRACT_THINKING_DEPTH', 'medium') + '" placeholder="medium" />';
      html += '<input id="todo-config-AGENTMEMORY_TODO_EXTRACT_TIMEOUT_MS" class="search-input" value="' + value('AGENTMEMORY_TODO_EXTRACT_TIMEOUT_MS', '120000') + '" placeholder="120000" />';
      html += '<div><div class="action-meta-text" style="margin-bottom:4px;">' + esc(t('settings.sinceDays')) + '</div><input id="todo-config-AGENTMEMORY_TODO_EXTRACT_SINCE_DAYS" class="search-input" type="number" min="1" value="' + value('AGENTMEMORY_TODO_EXTRACT_SINCE_DAYS', '7') + '" placeholder="7" /></div>';
      html += '<div><div class="action-meta-text" style="margin-bottom:4px;">' + esc(t('settings.maxInteractions')) + '</div><input id="todo-config-AGENTMEMORY_TODO_EXTRACT_MAX_INTERACTIONS_PER_SESSION" class="search-input" type="number" min="1" value="' + value('AGENTMEMORY_TODO_EXTRACT_MAX_INTERACTIONS_PER_SESSION', '10') + '" placeholder="10" /></div>';
      html += '<div><input id="todo-config-LANGEXTRACT_API_KEY" class="search-input" type="password" placeholder="' + esc(keyLabel) + '" />';
      if (maskedKey) html += '<div class="action-meta-text" style="margin-top:4px;">' + esc(t('settings.apiKeyLabel')) + ' ' + esc(maskedKey) + '</div>';
      html += '</div></div>';
      html += '<div style="display:flex;gap:8px;margin-top:12px;align-items:center;flex-wrap:wrap;">';
      html += '<button class="btn btn-primary" data-action="save-todo-config" type="button"' + (state.actions.configSaving ? ' disabled' : '') + '>' + esc(state.actions.configSaving ? t('settings.saving') : t('settings.save')) + '</button>';
      if (state.actions.config && state.actions.config.envPath) html += '<span class="action-meta-text">' + esc(state.actions.config.envPath) + '</span>';
      html += '</div>';
      if (state.actions.extractMessage) html += '<div class="settings-sub" style="margin-top:8px;">' + esc(state.actions.extractMessage) + '</div>';
      html += '</section>';
      panel.innerHTML = html;
    }

    function captureTodoConfigDraft() {
      var draft = state.actions.configDraft || {};
      [
        'AGENTMEMORY_TODO_EXTRACTOR',
        'LANGEXTRACT_PYTHON',
        'LANGEXTRACT_PROVIDER',
        'LANGEXTRACT_MODEL',
        'LANGEXTRACT_BASE_URL',
        'LANGEXTRACT_THINKING_DEPTH',
        'AGENTMEMORY_TODO_EXTRACT_TIMEOUT_MS',
        'AGENTMEMORY_TODO_EXTRACT_SINCE_DAYS',
        'AGENTMEMORY_TODO_EXTRACT_MAX_INTERACTIONS_PER_SESSION',
        'LANGEXTRACT_API_KEY'
      ].forEach(function(key) {
        var el = document.getElementById('todo-config-' + key);
        if (el) draft[key] = String(el.value || '');
      });
      state.actions.configDraft = draft;
      return draft;
    }

    function saveTodoExtractorConfig() {
      var fields = [
        'AGENTMEMORY_TODO_EXTRACTOR',
        'LANGEXTRACT_PYTHON',
        'LANGEXTRACT_PROVIDER',
        'LANGEXTRACT_MODEL',
        'LANGEXTRACT_BASE_URL',
        'LANGEXTRACT_THINKING_DEPTH',
        'AGENTMEMORY_TODO_EXTRACT_TIMEOUT_MS',
        'AGENTMEMORY_TODO_EXTRACT_SINCE_DAYS',
        'AGENTMEMORY_TODO_EXTRACT_MAX_INTERACTIONS_PER_SESSION',
        'LANGEXTRACT_API_KEY'
      ];
      var body = {};
      var draft = captureTodoConfigDraft();
      fields.forEach(function(key) {
        if (String(draft[key] || '').trim()) body[key] = String(draft[key] || '').trim();
      });
      state.actions.configSaving = true;
      renderSettingsPanel();
      apiPost('config/todo-extractor', body).then(function(res) {
        if (res && res.config) state.actions.config = res;
        state.actions.configDraft = {};
        state.actions.extractMessage = t('settings.savedRestart');
      }).catch(function() {
        state.actions.extractStatus = 'error';
        state.actions.extractMessage = t('settings.saveFailed');
      }).then(function() {
        state.actions.configSaving = false;
        renderSettingsPanel();
        if (state.activeTab === 'actions') renderActions();
      });
    }

    function updateActionStatus(actionId, status) {
      if (!actionId || !status) return;
      apiPost('actions/update', { actionId: actionId, status: status }).then(function(res) {
        if (!res || res.success === false) {
          state.actions.extractStatus = 'error';
          state.actions.extractMessage = t('act.status.updateFailed');
          renderActions();
          return;
        }
        state.actions.items = (state.actions.items || []).map(function(a) {
          return a.id === actionId ? Object.assign({}, a, { status: status, updatedAt: new Date().toISOString() }) : a;
        });
        renderActions();
      }).catch(function() {
        state.actions.extractStatus = 'error';
        state.actions.extractMessage = t('act.status.updateFailed');
        renderActions();
      });
    }

    function startTodoExtraction(force) {
      if (state.actions.extractInFlight) return;
      state.actions.extractInFlight = true;
      state.actions.extractStatus = 'running';
      state.actions.extractMessage = t('act.extract.starting');
      if (state.activeTab === 'actions') renderActions();
      var softRefreshDone = false;
      var softRefreshTimer = setTimeout(function() {
        if (!state.actions.extractInFlight || softRefreshDone) return;
        softRefreshDone = true;
        state.actions.extractMessage = t('act.extract.background');
        if (actionsScrolledAway()) {
          state.actions.stale = true;
          return;
        }
        if (state.activeTab === 'actions') renderActions();
        refreshActionListsAfterExtract().then(function() {
          if (!state.actions.extractInFlight) return;
          if (actionsScrolledAway()) {
            state.actions.stale = true;
            return;
          }
          if (state.activeTab === 'actions') renderActions();
        }).catch(function() {});
      }, 12000);
      // STEP-11: scope is governed by saved settings (sinceDays + max
      // interactions per session) which the backend reads from env config;
      // don't hard-code maxSessions/maxObservationsPerSession here or the
      // settings would never take effect on this primary extraction path.
      apiPost('todo-extract/generate', {
        force: force === true
      }).then(function(result) {
        var delta = todoExtractionDelta(result);
        if (!result || result.success !== true) {
          state.actions.extractStatus = 'error';
          state.actions.extractMessage = t('act.extract.failedExisting');
          return null;
        }
        state.actions.extractStatus = 'done';
        state.actions.extractFallback = !todoExtractionUsedLlm(result);
        state.actions.extractMessage = todoExtractionSummary(result);
        if (actionsScrolledAway()) {
          state.actions.stale = delta > 0;
          return null;
        }
        return refreshActionListsAfterExtract();
      }).catch(function() {
        state.actions.extractStatus = 'error';
        state.actions.extractMessage = t('act.extract.failedExisting');
      }).then(function() {
        clearTimeout(softRefreshTimer);
        state.actions.extractInFlight = false;
        if (state.activeTab === 'actions' && !actionsScrolledAway()) {
          renderActions();
        } else if (state.activeTab !== 'actions') {
          state.actions.loaded = false;
        }
      });
    }

    function todoCleanupSummary(r) {
      if (!r) return '';
      return t('act.cleanup.summary')
        .replace('{dropped}', r.dropped || 0)
        .replace('{completed}', r.completed || 0)
        .replace('{rewritten}', r.rewritten || 0)
        .replace('{merged}', r.merged || 0);
    }

    // LLM card update (STEP-12): re-judge cards whose source session changed.
    // Always dry-run first so the user confirms before anything is dropped/closed;
    // apply only on confirm (or silently when there is nothing to confirm — see
    // the all-KEEP branch below).
    function startTodoUpdate() {
      if (state.actions.cleanupInFlight || state.actions.extractInFlight) return;
      state.actions.cleanupInFlight = true;
      state.actions.cleanupStatus = 'running';
      state.actions.cleanupMessage = t('act.cleanup.running');
      if (state.activeTab === 'actions') renderActions();
      apiPost('todo/update', { mode: 'dry-run' }).then(function(preview) {
        state.actions.cleanupInFlight = false;
        if (!preview || typeof preview.scanned !== 'number') {
          state.actions.cleanupStatus = 'error';
          state.actions.cleanupMessage = t('act.cleanup.failed');
          if (state.activeTab === 'actions') renderActions();
          return;
        }
        var touched = (preview.dropped || 0) + (preview.completed || 0) + (preview.rewritten || 0) + (preview.merged || 0);
        if (touched === 0) {
          if (preview.fallbackReason) {
            // LLM unavailable — nothing ran, nothing to advance.
            state.actions.cleanupStatus = 'done';
            state.actions.cleanupMessage = t('act.cleanup.llmUnavailable');
            if (state.activeTab === 'actions') renderActions();
            return;
          }
          if ((preview.scanned || 0) > 0) {
            // Changed cards existed but the LLM kept them all. Silently apply so
            // their checkpoints advance and they aren't re-evaluated (and re-sent
            // to the LLM) on every future click. No card content changes, so no
            // confirmation is needed.
            state.actions.cleanupInFlight = true;
            apiPost('todo/update', { mode: 'apply', decisions: preview.decisions }).then(function() {
              return refreshActionListsAfterExtract();
            }).catch(function() {}).then(function() {
              state.actions.cleanupInFlight = false;
              state.actions.cleanupStatus = 'done';
              state.actions.cleanupMessage = t('act.cleanup.clean');
              if (state.activeTab === 'actions') renderActions();
            });
            return;
          }
          // Nothing changed at all.
          state.actions.cleanupStatus = 'done';
          state.actions.cleanupMessage = t('act.cleanup.clean');
          if (state.activeTab === 'actions') renderActions();
          return;
        }
        if (!window.confirm(t('act.cleanup.confirm') + '\n\n' + todoCleanupSummary(preview))) {
          state.actions.cleanupStatus = 'idle';
          state.actions.cleanupMessage = '';
          if (state.activeTab === 'actions') renderActions();
          return;
        }
        state.actions.cleanupInFlight = true;
        state.actions.cleanupStatus = 'running';
        state.actions.cleanupMessage = t('act.cleanup.applying');
        if (state.activeTab === 'actions') renderActions();
        apiPost('todo/update', { mode: 'apply', decisions: preview.decisions }).then(function(result) {
          state.actions.cleanupStatus = 'done';
          state.actions.cleanupMessage = todoCleanupSummary(result || preview);
          return refreshActionListsAfterExtract();
        }).catch(function() {
          state.actions.cleanupStatus = 'error';
          state.actions.cleanupMessage = t('act.cleanup.failed');
        }).then(function() {
          state.actions.cleanupInFlight = false;
          if (state.activeTab === 'actions') renderActions();
        });
      }).catch(function() {
        state.actions.cleanupInFlight = false;
        state.actions.cleanupStatus = 'error';
        state.actions.cleanupMessage = t('act.cleanup.failed');
        if (state.activeTab === 'actions') renderActions();
      });
    }

    // 待办→证据跳转:待办卡指向裸 obs_id,证据栏按 session 组织,
    // 后端无 obs_id→session 反查端点。遍历已加载会话,缓存优先、未命中才请求,命中即停。
    async function resolveObsSession(obsId) {
      if (!obsId) return null;
      var sessions = state.sessions.items || [];
      for (var i = 0; i < sessions.length; i++) {
        var s = sessions[i];
        var id = sessionId(s);
        if (!id) continue;
        var obs = null;
        var cached = state.sessions.detailCacheById && state.sessions.detailCacheById[id];
        if (cached && Array.isArray(cached.observations)) {
          obs = cached.observations;
        } else if (Array.isArray(s.embeddedObservations) && s.embeddedObservations.length) {
          obs = s.embeddedObservations;
        }
        if (obs && obs.some(function(o) { return o && o.id === obsId; })) return id;
        if (obs) continue;
        try {
          var res = await apiGet('observations?sessionId=' + encodeURIComponent(id));
          var list = (res && res.observations) || [];
          if (list.some(function(o) { return o && o.id === obsId; })) return id;
        } catch (e) { /* 单个会话取失败不阻断扫描 */ }
      }
      return null;
    }

    async function jumpToEvidence(obsId) {
      if (!obsId) return;
      if (!state.sessions.loaded) await loadSessions({ showLoading: false, reason: 'jump' });
      var targetSessionId = await resolveObsSession(obsId);
      if (!targetSessionId) {
        flashHint('未找到这条待办的来源会话（可能尚未同步或已被过滤）');
        return;
      }
      state.sessions.selectedId = targetSessionId;
      state.sessions.pendingHighlightObsId = obsId;
      // 来源观测画在「完整对话过程」区,默认折叠 → 跳转前强制展开,否则锚点不存在
      if (!state.sessions.detailSectionsById) state.sessions.detailSectionsById = {};
      var sec = state.sessions.detailSectionsById[targetSessionId] || { highlights: true, process: false };
      sec.process = true;
      state.sessions.detailSectionsById[targetSessionId] = sec;
      switchTab('sessions');
      renderSessions();
      await renderSessionDetail();
    }

    function flashHint(message) {
      var el = document.getElementById('jump-hint');
      if (!el) {
        el = document.createElement('div');
        el.id = 'jump-hint';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:var(--ink,#1a1a1a);color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.2);max-width:80vw;';
        (document.body || document.documentElement).appendChild(el);
      }
      el.textContent = message;
      el.style.opacity = '1';
      if (flashHint._t) clearTimeout(flashHint._t);
      flashHint._t = setTimeout(function() { if (el) el.style.opacity = '0'; }, 2600);
    }

    function applyPendingHighlight() {
      var obsId = state.sessions.pendingHighlightObsId;
      if (!obsId) return;
      state.sessions.pendingHighlightObsId = null;
      var anchor = document.getElementById('obs-anchor-' + obsId);
      if (!anchor) return;
      if (typeof anchor.scrollIntoView === 'function') anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      anchor.classList.add('obs-jump-highlight');
      setTimeout(function() { anchor.classList.remove('obs-jump-highlight'); }, 2400);
    }

    // STEP-C2/C3 待回应分区:接真实 inbox 数据(GET /agentmemory/inbox?status=awaiting)。
    // 按 kind 分两子区——question(🔴 Agent 在等你回)与 briefing(📋 Agent 主动整理),
    // 均按 createdAt 倒序(本轮不按 priority)。C3 加动作:question 可「回应」(行内输入
    // → inbox-answer)/「转待处理」(inbox-dismiss + action-create)/「知道了」(空 answer);
    // briefing 可「知道了」/「转待处理」。「看原文 →」复用 STEP-03。
    function inboxFromLabel(item) {
      var from = item && item.fromAgent ? String(item.fromAgent) : '';
      return from ? '来自 ' + esc(from) : '';
    }
    function inboxEvidenceButton(item) {
      var ids = (item && item.sourceObservationIds) || [];
      if (!ids.length) return '';
      return '<button type="button" class="btn inbox-evidence-link" style="font-size:10px;padding:2px 8px;" ' +
        'data-action="jump-to-evidence" data-obs-id="' + esc(ids[0]) + '">看原文 →</button>';
    }
    // STEP-D4 飞书投递状态徽标(只读,低干扰)。数据来自 GET /inbox 里 join 的 delivery
    // 台账(mem:delivery)。sent→已推送✓;failed→推送失败⚠+短错误摘要;skipped(投递
    // 未开启/无配置)默认不显示,避免污染 UI。
    function inboxDeliveryBadge(item) {
      var d = item && item.delivery;
      if (!d || !d.status) return '';
      if (d.status === 'sent') {
        var u = d.urgent ? ' · 加急' : '';
        return '<span class="inbox-delivery inbox-delivery-sent" title="已推送到飞书' + esc(u) + '">已推送 ✓' + esc(u) + '</span>';
      }
      if (d.status === 'failed') {
        var err = d.error ? String(d.error) : '';
        if (err.length > 60) err = err.slice(0, 60) + '…';
        var titleErr = d.error ? ' title="' + esc(String(d.error)) + '"' : '';
        return '<span class="inbox-delivery inbox-delivery-failed"' + titleErr + '>推送失败 ⚠' +
          (err ? ' <span class="inbox-delivery-err">' + esc(err) + '</span>' : '') + '</span>';
      }
      return ''; // skipped → silent
    }
    function inboxAwaiting() {
      var s = state.inbox || {};
      if (Array.isArray(s.awaitingItems) && s.awaitingItems.length) return s.awaitingItems;
      return Array.isArray(s.items) ? s.items : [];
    }
    function inboxAnswered() {
      var s = state.inbox || {};
      return Array.isArray(s.answeredItems) ? s.answeredItems : [];
    }
    function inboxDismissed() {
      var s = state.inbox || {};
      return Array.isArray(s.dismissedItems) ? s.dismissedItems : [];
    }
    function sortInboxItems(items) {
      return (items || []).slice().sort(function(a, b) {
        return new Date((b && (b.answeredAt || b.dismissedAt || b.updatedAt || b.createdAt)) || 0).getTime() -
          new Date((a && (a.answeredAt || a.dismissedAt || a.updatedAt || a.createdAt)) || 0).getTime();
      });
    }
    function inboxSearchText(item) {
      return [
        item && item.body,
        item && item.answer,
        item && item.fromAgent,
        item && item.status,
        item && item.kind,
      ].filter(Boolean).join(' ').toLowerCase();
    }
    function filterInboxItems(items, search) {
      if (!search) return items || [];
      return (items || []).filter(function(item) { return inboxSearchText(item).indexOf(search) >= 0; });
    }
    function inboxRecent(item) {
      var ts = item && (item.answeredAt || item.dismissedAt || item.updatedAt || item.createdAt);
      if (!ts) return false;
      var t = new Date(ts).getTime();
      return Number.isFinite(t) && Date.now() - t <= 24 * 60 * 60 * 1000;
    }
    function renderInboxCard(item, kind) {
      var marker = kind === 'question' ? '🔴' : '📋';
      var from = inboxFromLabel(item);
      var id = (item && item.id) || '';
      var html = '<article class="inbox-card inbox-card-' + kind + '" data-inbox-id="' + esc(id) + '">';
      html += '<div class="inbox-card-head">';
      html += '<span class="inbox-card-marker" aria-hidden="true">' + marker + '</span>';
      if (from) html += '<span class="inbox-card-from">' + from + '</span>';
      if (item && item.createdAt) html += '<span class="inbox-card-time">' + esc(shortTime(item.createdAt)) + '</span>';
      html += inboxDeliveryBadge(item);
      html += '</div>';
      html += '<div class="md-body inbox-card-body">' + renderMarkdownSafe((item && item.body) || '') + '</div>';

      var pending = isInboxPending(id);
      var dis = pending ? ' disabled aria-busy="true"' : '';
      html += '<div class="inbox-card-actions">';
      if (kind === 'question') {
        html += '<button type="button" class="btn btn-primary" style="font-size:10px;padding:2px 10px;" data-action="inbox-reply" data-inbox-id="' + esc(id) + '"' + dis + '>回应…</button>';
        html += '<button type="button" class="btn" style="font-size:10px;padding:2px 8px;" data-action="inbox-to-todo" data-inbox-id="' + esc(id) + '"' + dis + '>' + (pending ? '处理中…' : '转待处理') + '</button>';
        html += '<button type="button" class="btn" style="font-size:10px;padding:2px 8px;" data-action="inbox-ack" data-inbox-id="' + esc(id) + '"' + dis + '>知道了</button>';
      } else {
        html += '<button type="button" class="btn btn-primary" style="font-size:10px;padding:2px 10px;" data-action="inbox-ack" data-inbox-id="' + esc(id) + '"' + dis + '>知道了</button>';
        html += '<button type="button" class="btn" style="font-size:10px;padding:2px 8px;" data-action="inbox-to-todo" data-inbox-id="' + esc(id) + '"' + dis + '>' + (pending ? '处理中…' : '转待处理') + '</button>';
      }
      html += inboxEvidenceButton(item);
      html += '</div>';

      if (kind === 'question' && state.inbox.replyingId === id) {
        var sd = pending ? ' disabled aria-busy="true"' : '';
        html += '<div class="inbox-reply-box">';
        html += '<textarea class="inbox-reply-input" id="inbox-reply-input-' + esc(id) + '" rows="2" placeholder="回一句…"' + (pending ? ' disabled' : '') + '></textarea>';
        html += '<div class="inbox-reply-actions">';
        html += '<button type="button" class="btn btn-primary" style="font-size:10px;padding:3px 12px;" data-action="inbox-reply-submit" data-inbox-id="' + esc(id) + '"' + sd + '>' + (pending ? '提交中…' : '提交') + '</button>';
        html += '<button type="button" class="btn" style="font-size:10px;padding:3px 8px;" data-action="inbox-reply-cancel" data-inbox-id="' + esc(id) + '"' + sd + '>取消</button>';
        html += '</div></div>';
      }
      html += '</article>';
      return html;
    }
    function renderInboxArchiveCard(item) {
      var kind = item && item.kind === 'question' ? 'question' : 'briefing';
      var answered = item && item.status === 'answered';
      var marker = kind === 'question' ? '✅' : '✓';
      var cls = answered && kind === 'question' ? 'inbox-card-answered' : 'inbox-card-known';
      var from = inboxFromLabel(item);
      var ts = (item && (item.answeredAt || item.dismissedAt || item.updatedAt || item.createdAt)) || '';
      var html = '<article class="inbox-card ' + cls + '" data-inbox-id="' + esc((item && item.id) || '') + '">';
      html += '<div class="inbox-card-head">';
      html += '<span class="inbox-card-marker" aria-hidden="true">' + marker + '</span>';
      if (from) html += '<span class="inbox-card-from">' + from + '</span>';
      if (ts) html += '<span class="inbox-card-time">' + esc(shortTime(ts)) + '</span>';
      html += '</div>';
      html += '<div class="md-body inbox-card-body inbox-card-body-muted">' + renderMarkdownSafe((item && item.body) || '') + '</div>';
      if (answered && kind === 'question') {
        html += '<div class="inbox-card-answer"><span class="inbox-card-answer-label">你已回复：</span>' + esc((item && item.answer) || '知道了') + '</div>';
      }
      html += '</article>';
      return html;
    }
    function renderAwaitingQuestionSection() {
      var search = (state.actions.search || '').toLowerCase();
      var items = filterInboxItems(sortInboxItems(inboxAwaiting()), search);
      var questions = items.filter(function(i) { return i && i.kind === 'question'; });
      if (!questions.length) return '';
      var html = '<section class="card memory-section awaiting-reply-section" style="padding:14px 16px;margin-bottom:14px;background:#ffffff;">';
      html += '<div class="memory-section-head"><div>';
      html += '<div class="memory-section-title"><span class="awaiting-dot" aria-hidden="true"></span>待回应 (' + questions.length + ')</div>';
      html += '<div class="memory-summary-sub" style="margin-top:3px;">Agent 运行中抛给你的、时间敏感的问题会汇集到这里。</div>';
      html += '</div><span class="badge badge-muted">Agent 在等你回</span></div>';
      html += '<div class="inbox-card-list">';
      questions.forEach(function(it) { html += renderInboxCard(it, 'question'); });
      html += '</div></section>';
      return html;
    }
    function renderAwaitingBriefingSection() {
      var search = (state.actions.search || '').toLowerCase();
      var items = filterInboxItems(sortInboxItems(inboxAwaiting()), search);
      var briefings = items.filter(function(i) { return i && i.kind === 'briefing'; });
      if (!briefings.length) return '';
      var bExpanded = !!state.inbox.briefingExpanded || !!search;
      var html = '<section class="card memory-section awaiting-reply-section" style="padding:14px 16px;margin-bottom:14px;background:#ffffff;">';
      html += '<button type="button" class="inbox-subhead inbox-subhead-toggle" data-action="toggle-briefings" aria-expanded="' + (bExpanded ? 'true' : 'false') + '">';
      html += '<span class="inbox-subhead-marker" aria-hidden="true">📋</span>Agent 整理 (' + briefings.length + ')<span class="inbox-subhead-note">知悉即可</span>';
      html += '<span class="inbox-subhead-caret">' + (bExpanded ? '▾' : '▸') + '</span>';
      html += '</button>';
      if (bExpanded) {
        html += '<div class="inbox-card-list">';
        briefings.forEach(function(it) { html += renderInboxCard(it, 'briefing'); });
        html += '</div>';
      }
      html += '</section>';
      return html;
    }
    function renderInboxArchiveSection() {
      var search = (state.actions.search || '').toLowerCase();
      var answered = inboxAnswered();
      var dismissed = inboxDismissed();
      var all = sortInboxItems(answered.concat(dismissed));
      var visible = filterInboxItems(all, search);
      if (!visible.length) return '';
      var answeredQuestions = visible.filter(function(i) { return i && i.kind === 'question' && i.status === 'answered'; });
      var known = visible.filter(function(i) { return !(i && i.kind === 'question' && i.status === 'answered'); });
      var recentCount = visible.filter(inboxRecent).length;
      var expanded = !!state.inbox.answeredExpanded || !!search;
      var title = answeredQuestions.length ? '已回应 ' + answeredQuestions.length + ' 条' : '已回应';
      if (recentCount && !expanded) title += ' · 最近 ' + recentCount + ' 条';
      var html = '<section class="card memory-section inbox-archive-section" style="padding:14px 16px;margin-bottom:14px;background:#ffffff;">';
      html += '<button type="button" class="inbox-subhead inbox-subhead-toggle" data-action="toggle-inbox-archive" aria-expanded="' + (expanded ? 'true' : 'false') + '">';
      html += '<span class="inbox-subhead-marker" aria-hidden="true">✅</span>' + esc(title) + '<span class="inbox-subhead-note">只读归档</span>';
      html += '<span class="inbox-subhead-caret">' + (expanded ? '▾' : '▸') + '</span>';
      html += '</button>';
      if (expanded) {
        if (answeredQuestions.length) {
          html += '<div class="inbox-card-list">';
          answeredQuestions.forEach(function(it) { html += renderInboxArchiveCard(it); });
          html += '</div>';
        }
        if (known.length) {
          html += '<div class="inbox-subhead"><span class="inbox-subhead-marker" aria-hidden="true">✓</span>已知悉 (' + known.length + ')<span class="inbox-subhead-note">briefing / 已消解</span></div>';
          html += '<div class="inbox-card-list">';
          known.forEach(function(it) { html += renderInboxArchiveCard(it); });
          html += '</div>';
        }
      }
      html += '</section>';
      return html;
    }
    function renderAwaitingReplySection() {
      var search = (state.actions.search || '').toLowerCase();
      var items = filterInboxItems(sortInboxItems(inboxAwaiting()), search);
      var questions = items.filter(function(i) { return i && i.kind === 'question'; });
      var briefings = items.filter(function(i) { return i && i.kind === 'briefing'; });

      // 搜索时无命中:整区不渲染,避免空壳占位干扰搜索结果。
      if (search && !items.length) return '';

      var html = '<section class="card memory-section awaiting-reply-section" style="padding:14px 16px;margin-bottom:14px;background:#ffffff;">';
      html += '<div class="memory-section-head"><div>';
      html += '<div class="memory-section-title"><span class="awaiting-dot" aria-hidden="true"></span>待回应';
      if (questions.length) html += ' (' + questions.length + ')';
      html += '</div>';
      html += '<div class="memory-summary-sub" style="margin-top:3px;">Agent 运行中抛给你的、时间敏感的问题会汇集到这里。</div>';
      html += '</div>';
      if (questions.length) html += '<span class="badge badge-muted">Agent 在等你回</span>';
      html += '</div>';

      if (!items.length) {
        html += '<div class="awaiting-reply-empty">';
        html += '<div class="awaiting-reply-empty-title">暂无待回应</div>';
        html += '<div class="awaiting-reply-empty-lead">Agent 在会话中抛给你、在等你回的问题会出现在这里。目前没有待回应的条目。</div>';
        html += '</div>';
        html += '</section>';
        return html;
      }

      if (questions.length) {
        html += '<div class="inbox-card-list">';
        questions.forEach(function(it) { html += renderInboxCard(it, 'question'); });
        html += '</div>';
      }
      if (briefings.length) {
        // briefing 知悉即可、优先级低,默认折叠以缩短首屏、让 question 不被压下去。
        // 搜索命中时强制展开(否则命中的 briefing 藏在折叠里看不到)。
        var bExpanded = !!state.inbox.briefingExpanded || !!search;
        html += '<button type="button" class="inbox-subhead inbox-subhead-toggle" data-action="toggle-briefings" aria-expanded="' + (bExpanded ? 'true' : 'false') + '">';
        html += '<span class="inbox-subhead-marker" aria-hidden="true">📋</span>Agent 整理 (' + briefings.length + ')<span class="inbox-subhead-note">知悉即可</span>';
        html += '<span class="inbox-subhead-caret">' + (bExpanded ? '▾' : '▸') + '</span>';
        html += '</button>';
        if (bExpanded) {
          html += '<div class="inbox-card-list">';
          briefings.forEach(function(it) { html += renderInboxCard(it, 'briefing'); });
          html += '</div>';
        }
      }
      html += '</section>';
      return html;
    }

    // STEP-C3 收件箱动作。每个动作改后端状态后,从 state.inbox.items 本地剔除该项 +
    // 重渲染(乐观更新),避免全量 loadActions 抖动;失败用 flashHint 提示。
    function removeInboxItemLocal(id) {
      state.inbox.items = (state.inbox.items || []).filter(function(i) { return i && i.id !== id; });
      state.inbox.awaitingItems = (state.inbox.awaitingItems || []).filter(function(i) { return i && i.id !== id; });
      if (state.inbox.replyingId === id) state.inbox.replyingId = null;
    }
    function findInboxItem(id) {
      return inboxAwaiting().filter(function(i) { return i && i.id === id; })[0] || null;
    }
    function archiveInboxItemLocal(id, status, answer) {
      var item = findInboxItem(id);
      removeInboxItemLocal(id);
      if (!item) return;
      var archived = Object.assign({}, item, {
        status: status,
        answer: answer || item.answer || '',
        updatedAt: new Date().toISOString(),
      });
      if (status === 'answered') {
        archived.answeredAt = archived.updatedAt;
        state.inbox.answeredItems = [archived].concat(state.inbox.answeredItems || []);
      } else {
        archived.dismissedAt = archived.updatedAt;
        state.inbox.dismissedItems = [archived].concat(state.inbox.dismissedItems || []);
      }
    }
    // 防重入:动作进行中标记 pendingById[id],按钮渲染为 disabled,
    // 慢网下连点不会重复提交(尤其转待处理的 create 会重复建待办)。
    function isInboxPending(id) {
      return !!(state.inbox.pendingById && state.inbox.pendingById[id]);
    }
    function setInboxPending(id, on) {
      if (!state.inbox.pendingById) state.inbox.pendingById = {};
      if (on) state.inbox.pendingById[id] = true;
      else delete state.inbox.pendingById[id];
    }
    function openInboxReply(id) {
      state.inbox.replyingId = (state.inbox.replyingId === id) ? null : id;
      renderActions();
      if (state.inbox.replyingId === id) {
        var input = document.getElementById('inbox-reply-input-' + id);
        if (input && typeof input.focus === 'function') input.focus();
      }
    }
    function cancelInboxReply() {
      state.inbox.replyingId = null;
      renderActions();
    }
    async function submitInboxReply(id) {
      if (isInboxPending(id)) return;
      var input = document.getElementById('inbox-reply-input-' + id);
      var answer = input ? String(input.value || '').trim() : '';
      if (!answer) { flashHint('回应内容不能为空'); if (input && input.focus) input.focus(); return; }
      setInboxPending(id, true);
      renderActions();
      try {
        var res = await apiPost('inbox/answer', { id: id, answer: answer });
        if (!res || res.success !== true) { flashHint('回应未送达,请确认本地 worker 在运行'); return; }
        archiveInboxItemLocal(id, 'answered', answer);
        flashHint('已回应,Agent 会看到');
      } finally {
        setInboxPending(id, false);
        renderActions();
      }
    }
    async function ackInboxItem(id) {
      if (isInboxPending(id)) return;
      setInboxPending(id, true);
      renderActions();
      try {
        // 空 answer = 已读/ack(briefing 或无需回的 question)。
        var res = await apiPost('inbox/answer', { id: id });
        if (!res || res.success !== true) { flashHint('操作未送达,请确认本地 worker 在运行'); return; }
        archiveInboxItemLocal(id, 'answered', '');
        flashHint('已标记知道了');
      } finally {
        setInboxPending(id, false);
        renderActions();
      }
    }
    async function convertInboxToTodo(id) {
      if (isInboxPending(id)) return;
      // 转待处理:先建 action(标题取 body),成功后再 dismiss inbox 项;
      // 串行 + 失败回滚提示,避免「dismiss 了却没建 action」的丢条目。
      var item = findInboxItem(id);
      if (!item) return;
      setInboxPending(id, true);
      renderActions();
      try {
        var title = String(item.body || '').trim().slice(0, 120) || '(来自收件箱)';
        var created = await apiPost('actions', { title: title, createdBy: 'inbox', project: item.project });
        if (!created || created.success !== true) { flashHint('转待处理失败:未能创建待办'); return; }
        var dismissed = await apiPost('inbox/dismiss', { id: id });
        if (!dismissed || dismissed.success !== true) {
          flashHint('已建待办,但收件箱项未消解,请手动「知道了」');
          state.actions.loaded = false;
          loadActions({ generate: false });
          return;
        }
        archiveInboxItemLocal(id, 'dismissed', '');
        state.actions.loaded = false;
        loadActions({ generate: false });
        flashHint('已转入待处理');
      } finally {
        setInboxPending(id, false);
        renderActions();
      }
    }

    // STEP-C4「已完成」折叠区:只读现有 action.status==='done' 且当天 updatedAt 的项,
    // 默认折叠(§3.2)。不新增抽取器、不动后端,纯前端筛 state.actions.items。
    function isUpdatedToday(ts) {
      if (!ts) return false;
      var d = new Date(ts);
      if (isNaN(d.getTime())) return false;
      var now = new Date();
      return d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
    }
    function renderDoneTodaySection(doneItems, frontierIds, cardRenderer) {
      var today = (doneItems || []).filter(function(a) { return isUpdatedToday(a.updatedAt); });
      if (!today.length) return '';
      var expanded = !!state.actions.doneExpanded;
      var html = '<section class="action-group done-today-section">';
      html += '<button type="button" class="action-group-head done-today-head" data-action="toggle-done-today" aria-expanded="' + (expanded ? 'true' : 'false') + '">';
      html += '<div class="action-group-title">🟢 已完成 <span class="done-today-sub">今天完成了 ' + today.length + ' 件</span></div>';
      html += '<span class="done-today-caret">' + (expanded ? '▾' : '▸') + '</span>';
      html += '</button>';
      if (expanded && typeof cardRenderer === 'function') {
        html += '<div class="action-card-list">';
        today.forEach(function(a) {
          html += cardRenderer(a, frontierIds.has(a.id));
        });
        html += '</div>';
      }
      html += '</section>';
      return html;
    }

    function renderActions() {
      var el = document.getElementById('view-actions');
      var items = (state.actions.items || []).filter(isActionRenderable).slice();
      var reviewItems = (state.actions.reviewItems || []).filter(isActionReviewRenderable);
      var search = state.actions.search.toLowerCase();
      var statusFilter = state.actions.statusFilter === 'all' ? '' : state.actions.statusFilter;
      var frontierIds = new Set((state.actions.frontier || []).map(function(a) { return a.id; }));

      if (search) {
        items = items.filter(function(a) {
          return (a.title + ' ' + (a.description || '') + ' ' + (a.tags || []).join(' ') + ' ' + (a.project || '')).toLowerCase().indexOf(search) >= 0;
        });
        reviewItems = reviewItems.filter(function(item) {
          return ((item.title || '') + ' ' + (item.content || '') + ' ' + (reviewProject(item) || '') + ' ' + reviewTags(item).join(' ')).toLowerCase().indexOf(search) >= 0;
        });
      }
      var metricItems = items.slice();
      var metricReviewItems = reviewItems.slice();
      if (statusFilter && statusFilter !== 'review' && statusFilter !== 'awaiting') {
        // STEP-13: the "待跟进 / Follow-up" metric card counts pending + blocked
        // and filters with data-status="pending", so the pending filter must show
        // blocked too — otherwise its count and its results disagree.
        items = items.filter(function(a) {
          return statusFilter === 'pending' ? (a.status === 'pending' || a.status === 'blocked') : a.status === statusFilter;
        });
      }
      if (statusFilter === 'review' || statusFilter === 'awaiting') {
        items = [];
      }
      var showReviewItems = statusFilter === 'review';
      var showAwaitingItems = !statusFilter || statusFilter === 'awaiting';
      var showBriefingItems = !statusFilter;

      function actionAttentionKey(a, isFrontier) {
        if (a.status === 'done' || a.status === 'cancelled') return '';
        if (isFrontier) return 'next';
        if (a.status === 'blocked') return 'needsWork';
        if (a.priority === 'high' || Number(a.priority) >= 8) return 'noteworthy';
        return '';
      }
      function actionDescriptionText(text) {
        var s = String(text || '').trim();
        if (!s) return '';
        if (I18N_LANG !== 'zh') return s;
        var map = [
          [/^Execute launch promotion for GitHub, Xiaohongshu, V2EX, Reddit, X, and other target communities\..*$/i, '继续推进 GitHub、小红书、V2EX、Reddit 和 X 等渠道的发布推广。'],
          [/^Execute launch promotion for (.+)$/i, '继续推进 $1 的发布推广。'],
          [/^Create a Notion-style continuous-motion 30s README demo[:：]?\s*(.+)$/i, '制作 30 秒 README 演示，展示从输入到结果预览的完整路径。'],
          [/^Use huashu-design video workflow to produce a short README\/social demo showing how the study abroad applications skill works[:：]?\s*(.+)$/i, '制作一段适合 README 和社媒使用的短演示，说明留学申请 Skill 的使用过程。'],
          [/^Use huashu-design video workflow to produce a short README\/social demo showing how the study abroad applications skill works\.?$/i, '制作一段适合 README 和社媒使用的短演示，说明留学申请 Skill 的使用过程。'],
          [/^Use huashu-design video workflow to produce a short README\/social demo showing how (.+?) works[:：]?\s*(.+)$/i, '制作一段适合 README 和社媒使用的短演示，说明 $1 的使用过程。'],
          [/^Use huashu-design video workflow to produce a short README\/social demo showing how (.+?) works\.?$/i, '制作一段适合 README 和社媒使用的短演示，说明 $1 的使用过程。'],
          [/^来源：(.+)$/i, '来自 $1'],
          [/^来自本地审计日志$/i, '来自本地操作记录']
        ];
        for (var i = 0; i < map.length; i++) {
          if (map[i][0].test(s)) return s.replace(map[i][0], map[i][1]);
        }
        return s;
      }
      function actionSourceText(a) {
        var parts = [];
        if (a.project) parts.push(projectDisplayName(a.project));
        if (a.source) parts.push(a.source);
        return parts.join(' · ');
      }
      function actionVisibleTags(tags) {
        var all = Array.isArray(tags) ? tags.filter(Boolean).map(String) : [];
        var visible = [];
        function add(tag) {
          if (tag && visible.indexOf(tag) < 0) visible.push(tag);
        }
        all.filter(function(tag) {
          return tag === 'todo-extracted' || tag === 'todo-recheck' || /^time:[a-z_]+$/i.test(tag) || /^type:[a-z_]+$/i.test(tag);
        }).forEach(add);
        all.forEach(function(tag) {
          if (visible.length < 5) add(tag);
        });
        return visible.slice(0, 5);
      }
      function actionTitleText(text) {
        var s = String(text || t('act.untitled')).trim();
        if (I18N_LANG !== 'zh') return s;
        var map = [
          [/^Create README 30s demo GIF and backup MP4 for taught-master-applications-skill$/i, '制作留学申请 Skill 的 README 演示视频'],
          [/^Create README 30s demo GIF and backup MP4 for (.+)$/i, '制作 $1 的 README 演示视频'],
          [/^Create 30-second demo GIF\/video for taught-master-applications-skill$/i, '制作留学申请 Skill 的 30 秒演示视频'],
          [/^Promote\s+(.+?)\s+across target platforms$/i, '推广 $1'],
          [/^Build\s+(.+)$/i, '制作 $1'],
          [/^Create\s+(.+)$/i, '创建 $1'],
          [/^Execute\s+(.+)$/i, '执行 $1'],
          [/^Review\s+(.+)$/i, '复盘 $1'],
          [/^Check\s+(.+)$/i, '检查 $1']
        ];
        for (var i = 0; i < map.length; i++) {
          if (map[i][0].test(s)) return s.replace(map[i][0], map[i][1]);
        }
        return s;
      }
      function priorityLabel(value) {
        if (value === 'high' || Number(value) >= 8) return t('act.prio.high');
        if (value === 'normal' || Number(value) >= 5) return t('act.prio.normal');
        return t('act.prio.low');
      }
      function priorityClass(value) {
        if (value === 'high' || Number(value) >= 8) return 'high';
        if (value === 'normal' || Number(value) >= 5) return 'normal';
        return 'low';
      }
      function compactActionTitle(text) {
        var s = String(text || t('act.untitled')).replace(/^(TODO|FIXME)\s*[:：-]\s*/i, '').trim();
        var headingMatch = s.match(/#{1,6}\s*([^#\n]+?)(?=\s+#{1,6}\s|$)/);
        if (headingMatch && !/^(Summary|Key Changes|Test Plan|Assumptions|Public API|Implementation)\b/i.test(headingMatch[1].trim())) {
          s = headingMatch[1].trim();
        }
        s = s
          .replace(/#{1,6}\s*(Summary|Key Changes|Test Plan|Assumptions|Public API|Implementation)\b[\s\S]*$/i, '')
          .replace(/#{1,6}\s*/g, '')
          .replace(/\b(Summary|Key Changes|Test Plan|Assumptions|Public API|Implementation)\b[\s\S]*$/i, '')
          .replace(/\s+/g, ' ')
          .trim();
        var first = s.split(/[。！？\n]/u)[0] || s;
        return truncate(actionTitleText(first.replace(/[。！？；;,.，]+$/u, '').trim() || t('act.untitled')), 72);
      }
      function stripMarkdownPlanText(text) {
        return String(text || '')
          .replace(/\s+(#{1,6}\s+)/g, '\n$1')
          .split(/\n+/)
          .filter(function(line) {
            var trimmed = line.trim();
            if (!trimmed) return false;
            if (/^#{1,6}\s/.test(trimmed)) return false;
            if (/^\s*[-*]\s+/.test(line)) return false;
            if (/^(Summary|Key Changes|Test Plan|Assumptions|Public API|Implementation)\b/i.test(trimmed)) return false;
            if (/^(执行步骤|验证命令|停止条件|修改范围)[:：]?/u.test(trimmed)) return false;
            return true;
          })
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      function candidatePreviewText(item) {
        var title = compactActionTitle(item && item.title);
        var content = String((item && item.content) || '').trim();
        if (!content) return '';
        var isStructured = isMarkdownPlanText(content);
        var cleaned = isStructured ? stripMarkdownPlanText(content) : content;
        if (isStructured) {
          var sentence = (cleaned.match(/(?:TODO|FIXME|下一步|后续|待办|修复|补充|实现|调整|验证|提交|创建|更新|移除|处理)[^。！？\n]{4,80}[。！？]?/u) || [])[0];
          cleaned = sentence || '';
        }
        cleaned = cleaned
          .replace(/^(TODO|FIXME)\s*[:：-]\s*/i, '')
          .replace(/^(下一步|后续|待办)\s*[:：-]?\s*/u, '')
          .replace(/^(请|需要|必须)\s*/u, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!cleaned || cleaned === title || cleaned.indexOf(title) === 0) return '';
        return truncate(actionDescriptionText(cleaned), 96);
      }
      function actionMetricCards(counts, reviewCount, waitingCount) {
        var metrics = [
          { label: t('act.metric.waiting'), value: waitingCount, filter: 'awaiting', primary: waitingCount > 0 },
          { label: t('act.metric.review'), value: reviewCount, filter: 'review', primary: waitingCount === 0 && reviewCount > 0 },
          { label: t('act.metric.followUp'), value: counts.pending + counts.blocked, filter: 'pending', primary: waitingCount === 0 && reviewCount === 0 && (counts.pending + counts.blocked) > 0 },
          { label: t('act.metric.active'), value: counts.active, filter: 'active', primary: false },
          { label: t('act.metric.done'), value: counts.done, filter: 'done', primary: false }
        ];
        var html = '<div class="action-overview">';
        metrics.forEach(function(m) {
          var active = (state.actions.statusFilter || '') === m.filter;
          html += '<button class="action-overview-card' + (m.primary ? ' primary' : '') + (active ? ' active' : '') + '" data-action="filter-actions-status" data-status="' + esc(m.filter) + '" type="button"><div class="action-overview-label">' + esc(m.label) + '</div><div class="action-overview-value">' + m.value + '</div></button>';
        });
        html += '</div>';
        return html;
      }
      function renderActionFilters() {
        // STEP-13: the status-filter chip row duplicated the metric overview
        // cards below (actionMetricCards) — same state.actions.statusFilter, same
        // values (pending/review/active/done). Keep the metric cards (they carry
        // counts) as the single status filter; this row keeps only search + the
        // action buttons.
        var html = '<div class="actions-filter-row">';
        html += '<input id="actions-search" class="search-input" type="text" placeholder="' + esc(t('act.searchPlaceholder')) + '" value="' + esc(state.actions.search) + '" style="flex:1;min-width:200px" />';
        html += '<span style="font-size:12px;color:var(--ink-faint);align-self:center;">' + metricReviewItems.length + ' ' + t('act.nToConfirm') + ' · ' + metricItems.length + ' ' + t('act.nConfirmed') + '</span>';
        var extractTitle = state.actions.extractMessage || t('act.extract.title');
        var extractLabel = t('act.extract.run');
        if (state.actions.extractInFlight) extractLabel = t('act.extract.running');
        else if (state.actions.extractStatus === 'done') extractLabel = state.actions.extractFallback ? t('act.extract.rules') : t('act.extract.done');
        else if (state.actions.extractStatus === 'error') extractLabel = t('act.extract.error');
        html += '<button class="btn btn-primary' + (state.actions.extractInFlight ? ' btn-working' : '') + '" data-action="extract-actions" type="button" title="' + esc(extractTitle) + '" style="margin-left:auto;"' + (state.actions.extractInFlight ? ' disabled aria-busy="true"' : '') + '>' + esc(extractLabel) + '</button>';
        var cleanupLabel = t('act.cleanup.run');
        if (state.actions.cleanupInFlight) cleanupLabel = t('act.cleanup.running');
        else if (state.actions.cleanupStatus === 'done') cleanupLabel = t('act.cleanup.done');
        else if (state.actions.cleanupStatus === 'error') cleanupLabel = t('act.cleanup.error');
        html += '<button class="btn' + (state.actions.cleanupInFlight ? ' btn-working' : '') + '" data-action="update-cards" type="button" title="' + esc(state.actions.cleanupMessage || t('act.cleanup.title')) + '"' + (state.actions.cleanupInFlight ? ' disabled aria-busy="true"' : '') + '>' + esc(cleanupLabel) + '</button>';
        html += '<button class="btn' + (state.actions.stale ? ' btn-soft-alert' : '') + '" data-action="refresh-actions" type="button">' + (state.actions.stale ? t('act.refresh') : t('act.refresh')) + '</button>';
        html += '</div>';
        return html;
      }
      function renderActionCandidateCard(item) {
        var priority = reviewActionPriority(item);
        var project = reviewProject(item);
        var title = compactActionTitle(item.title || t('act.untitledCandidate'));
        var preview = candidatePreviewText(item);
        var raw = String(item.content || '').trim();
        var showOriginal = raw && isMarkdownPlanText(raw);
        var html = '<article class="action-item-card action-candidate-card">';
        html += '<div class="action-priority-rail ' + priorityClass(priority) + '"></div>';
        html += '<div class="action-candidate-main">';
        html += '<div class="action-candidate-head"><span class="badge badge-green">' + t('filter.review') + '</span><span class="badge badge-muted">' + esc(priorityLabel(priority)) + '</span></div>';
        html += '<div class="action-item-title" style="margin-top:6px;">' + esc(title) + '</div>';
        if (preview) html += '<div class="action-item-desc">' + esc(preview) + '</div>';
        html += '<div class="action-item-meta">';
        if (project) html += '<span class="badge badge-muted">' + esc(projectDisplayName(project)) + '</span>';
        html += '</div>';
        if (showOriginal) {
          html += '<details class="action-original-disclosure"><summary>' + t('act.viewOriginal') + '</summary><pre>' + esc(truncate(raw, 1200)) + '</pre></details>';
        }
        html += '</div>';
        html += '<div class="action-item-actions"><button class="btn btn-primary" data-action="edit-review" data-review-id="' + esc(item.id) + '">' + t('act.confirm') + '</button><button class="btn" data-action="dismiss-review" data-review-id="' + esc(item.id) + '">' + t('act.ignore') + '</button></div>';
        html += '</article>';
        return html;
      }
      function renderActionCard(a, isFrontier) {
        var html = '<article class="action-item-card action-approved-card">';
        html += '<div class="action-priority-rail ' + priorityClass(a.priority) + '"></div>';
        html += '<div class="action-candidate-main">';
        html += '<div class="action-item-title">' + esc(compactActionTitle(a.title)) + '</div>';
        var actionDesc = actionDescriptionText(a.description);
        if (actionDesc) html += '<div class="action-item-desc">' + esc(truncate(actionDesc, 120)) + '</div>';
        // STEP-16 calm card: source + relative time are hidden at rest and fade in
        // on hover; priority shows on the rail, status via the group. No badges /
        // status icon / classification tags.
        var metaParts = [];
        var sourceText = actionSourceText(a);
        if (sourceText) metaParts.push(t('act.from') + ' ' + esc(sourceText));
        if (a.updatedAt) metaParts.push(esc(relativeTime(a.updatedAt)));
        if (metaParts.length) html += '<div class="action-item-submeta"' + (a.updatedAt ? ' title="' + esc(absoluteHour(a.updatedAt)) + '"' : '') + '>' + metaParts.join(' · ') + '</div>';
        html += '</div>';
        html += '<div class="action-item-actions">';
        html += '<div class="action-secondary">';
        var jumpObsId = Array.isArray(a.sourceObservationIds) ? a.sourceObservationIds.find(function(id) { return typeof id === 'string' && id.length > 0; }) : '';
        if (jumpObsId) html += '<button class="btn-ghost-sm" type="button" data-action="jump-to-evidence" data-obs-id="' + esc(jumpObsId) + '">' + esc(t('act.viewSource')) + '</button>';
        if (a.status !== 'cancelled') html += '<button class="btn-ghost-sm" data-action="action-status" data-action-id="' + esc(a.id || '') + '" data-status="cancelled" type="button">' + esc(t('act.status.archive')) + '</button>';
        html += '</div>';
        if (a.status !== 'done') html += '<button class="btn-outline-sm" data-action="action-status" data-action-id="' + esc(a.id || '') + '" data-status="done" type="button">' + esc(t('act.status.complete')) + '</button>';
        html += '</div>';
        html += '</article>';
        return html;
      }
      var statusCounts = { active: 0, blocked: 0, pending: 0, done: 0, cancelled: 0 };
      metricItems.forEach(function(a) { if (statusCounts[a.status] !== undefined) statusCounts[a.status] += 1; });
      var searchForInbox = (state.actions.search || '').toLowerCase();
      var waitingCount = filterInboxItems(sortInboxItems(inboxAwaiting()), searchForInbox).filter(function(i) { return i && i.kind === 'question'; }).length;
      var awaitingQuestionsHtml = showAwaitingItems ? renderAwaitingQuestionSection() : '';
      var awaitingBriefingsHtml = showBriefingItems ? renderAwaitingBriefingSection() : '';
      var inboxArchiveHtml = showBriefingItems ? renderInboxArchiveSection() : '';

      var html = renderActionFilters();
      html += actionMetricCards(statusCounts, metricReviewItems.length, waitingCount);
      html += awaitingQuestionsHtml;

      if (showReviewItems && reviewItems.length) {
        html += '<section class="card memory-section" style="padding:14px 16px;margin-bottom:14px;background:#ffffff;">';
        html += '<div class="memory-section-head"><div><div class="memory-section-title">' + t('filter.review') + '</div></div><span class="memory-section-count">' + reviewItems.length + ' ' + t('act.itemsUnit') + '</span></div>';
        html += '<div class="action-card-list">';
        reviewItems.forEach(function(item) {
          html += renderActionCandidateCard(item);
        });
        html += '</div></section>';
      }

      html += awaitingBriefingsHtml;

      if (items.length === 0 && (!showReviewItems || reviewItems.length === 0) && !awaitingQuestionsHtml && !awaitingBriefingsHtml && !inboxArchiveHtml) {
        html += '<div class="empty-state">' +
          '<div class="empty-icon">&#9745;</div>' +
          '<div class="empty-title">' + t('act.empty.title') + '</div>' +
          '<div class="empty-lead">' + t('act.empty.lead') + '</div>' +
          '</div>';
      } else {
        items = items.slice().sort(function(a, b) {
          var order = { active: 1, blocked: 2, pending: 3, done: 4, cancelled: 5 };
          return (order[a.status] || 9) - (order[b.status] || 9) || (Number(b.priority) || 0) - (Number(a.priority) || 0);
        });
        // STEP-C4:无筛选的默认视图里,done 不混在分组流中,改由底部「已完成」
        // 折叠区单独承载、且只显当天完成的(§3.2/§3.3)。点了「已完成」筛选 chip
        // (statusFilter==='done')时则照常全列,不走折叠区。
        // STEP-12:cancelled(归档/被更新丢弃/被合并)也不进默认活动视图——否则
        // 合并/丢弃后卡片仍以「已取消」分组留在原处,看着像「没生效」。
        var defaultView = !statusFilter;
        var inlineStatuses = defaultView
          ? ['active','blocked','pending']
          : ['active','blocked','pending','done','cancelled'];
        inlineStatuses.forEach(function(status) {
          var group = items.filter(function(a) { return a.status === status; });
          if (!group.length) return;
          html += '<section class="action-group">';
          html += '<div class="action-group-head"><div class="action-group-title">' + esc(statusLabel(status)) + '</div><div class="lesson-count-pill">' + group.length + ' ' + t('act.itemsUnit') + '</div></div>';
          html += '<div class="action-card-list">';
          group.forEach(function(a) {
            var isFrontier = frontierIds.has(a.id);
            html += renderActionCard(a, isFrontier);
          });
          html += '</div></section>';
        });
        if (defaultView) {
          html += renderDoneTodaySection(items.filter(function(a) { return a.status === 'done'; }), frontierIds, renderActionCard);
        }
      }
      html += inboxArchiveHtml;

      var __focus = captureSearchFocus(['actions-search']);
      el.innerHTML = html;
      var __as = document.getElementById('actions-search');
      if (__as) bindImeSafeSearch(__as, 200, function(v){ state.actions.search = v; renderActions(); });
      restoreSearchFocus(__focus);
    }

    async function loadCrystals() {
      var el = document.getElementById('view-crystals');
      el.innerHTML = '<div class="loading">正在加载结晶...</div>';
      var results = await Promise.all([apiGet('crystals'), apiGet('lessons')]);
      state.crystals.items = (results[0] && results[0].crystals) || [];
      var lessonMap = {};
      var lessons = (results[1] && results[1].lessons) || [];
      lessons.forEach(function(l) { if (l && l.id) lessonMap[l.id] = l; });
      state.crystals.lessonMap = lessonMap;
      state.crystals.loaded = true;
      renderCrystals();
    }

    function renderCrystals() {
      var el = document.getElementById('view-crystals');
      var items = state.crystals.items;
      var search = state.crystals.search.toLowerCase();
      var lessonMap = state.crystals.lessonMap || {};

      if (search) {
        items = items.filter(function(c) {
          var lessonText = (c.lessons || [])
            .map(function(lid) {
              var l = lessonMap[lid];
              return l && typeof l.content === 'string' ? l.content : lid;
            })
            .join(' ');
          var filesText = (c.filesAffected || []).join(' ');
          var haystack = [
            c.narrative || '',
            (c.keyOutcomes || []).join(' '),
            lessonText,
            filesText,
            c.project || '',
          ].join(' ').toLowerCase();
          return haystack.indexOf(search) >= 0;
        });
      }

      var html = '<div class="crystal-intro">';
      html += '<div><div class="crystal-intro-title">工作沉淀</div>';
      html += '<div class="crystal-intro-copy">这里保留已经整理过的工作结果：做了什么、留下了哪些文件、能复用什么经验。</div></div>';
      html += '<div class="crystal-count-pill">' + items.length + ' 条</div>';
      html += '</div>';

      html += '<div style="display:flex;gap:8px;margin-bottom:12px;">';
      html += '<input id="crystals-search" class="search-input" type="text" placeholder="搜索结晶..." value="' + esc(state.crystals.search) + '" style="flex:1" />';
      html += '</div>';

      if (items.length === 0) {
        html += '<div class="empty-state">' +
          '<div class="empty-icon">&#128142;</div>' +
          '<div class="empty-title">还没有结晶</div>' +
          '<div class="empty-lead">结晶是一次完整工作的压缩摘要，用来保留关键结论、涉及文件和可复用经验。当前还没有生成结晶，但会话和记忆已经可以先使用。</div>' +
          '<pre class="empty-cmd">导入历史会话后，可以把重要会话整理成结晶；后续我会优先把这里做成一键整理。</pre>' +
          '<div><a class="empty-link" href="https://github.com/MaimoryLab/agentmemory-lab#crystals" target="_blank" rel="noopener">结晶说明</a></div>' +
          '</div>';
      } else {
        html += '<div class="crystal-list">';
        items.forEach(function(c) {
          html += '<article class="crystal-card">';
          html += '<div class="crystal-card-head">';
          html += '<div class="crystal-card-title">' + esc(truncate(c.narrative || '未命名工作', 180)) + '</div>';
          html += '<div class="crystal-card-time">' + esc(shortDateTime(c.createdAt)) + '</div>';
          html += '</div>';

          var pillRow = [];
          if (c.project) pillRow.push('<span class="badge badge-muted">' + esc(projectDisplayName(c.project)) + '</span>');
          if (c.filesAffected && c.filesAffected.length) pillRow.push('<span class="badge badge-blue">' + c.filesAffected.length + ' 个文件</span>');
          if (c.lessons && c.lessons.length) pillRow.push('<span class="badge badge-green">' + c.lessons.length + ' 条经验</span>');
          if (pillRow.length) html += '<div class="crystal-meta-row">' + pillRow.join('') + '</div>';

          if (c.filesAffected && c.filesAffected.length > 0) {
            html += '<div class="crystal-section"><div class="crystal-section-label">涉及文件</div>';
            html += '<div class="crystal-soft-list">';
            c.filesAffected.slice(0, 4).forEach(function(f) {
              html += '<div>' + esc(f) + '</div>';
            });
            if (c.filesAffected.length > 4) html += '<div>还有 ' + (c.filesAffected.length - 4) + ' 个文件</div>';
            html += '</div></div>';
          }

          if (c.lessons && c.lessons.length > 0) {
            html += '<div class="crystal-section"><div class="crystal-section-label">可复用经验</div>';
            html += '<div class="crystal-soft-list">';
            c.lessons.slice(0, 3).forEach(function(lid) {
              var content = lessonMap[lid] ? lessonMap[lid].content : lid;
              html += '<div>' + esc(content) + '</div>';
            });
            if (c.lessons.length > 3) html += '<div>还有 ' + (c.lessons.length - 3) + ' 条经验</div>';
            html += '</div></div>';
          }

          html += '</article>';
        });
        html += '</div>';
      }

      var __focus = captureSearchFocus(['crystals-search']);
      el.innerHTML = html;
      var __cs = document.getElementById('crystals-search');
      if (__cs) bindImeSafeSearch(__cs, 200, function(v){ state.crystals.search = v; renderCrystals(); });
      restoreSearchFocus(__focus);
    }

    async function loadAudit() {
      var el = document.getElementById('view-audit');
      el.innerHTML = '<div class="loading">加载审计日志中...</div>';
      var result = await apiGet('audit?limit=100');
      state.audit.entries = (result && result.entries) || [];
      state.audit.loaded = true;
      renderAudit();
    }

    function renderAudit() {
      var el = document.getElementById('view-audit');
      var entries = state.audit.entries;
      var opFilter = state.audit.opFilter;

      var ops = {};
      entries.forEach(function(e) { ops[e.operation] = true; });
      var opList = Object.keys(ops).sort();

      var filtered = opFilter ? entries.filter(function(e) { return e.operation === opFilter; }) : entries;

      var html = '<div class="toolbar">';
      html += '<select id="audit-op-filter"><option value="">全部操作</option>';
      opList.forEach(function(op) {
        html += '<option value="' + esc(op) + '"' + (opFilter === op ? ' selected' : '') + '>' + esc(op) + '</option>';
      });
      html += '</select>';
      html += '<button class="btn" data-action="refresh-audit" style="margin-left:8px;">刷新日志</button>';
      html += '</div>';

      html += '<div class="card">';
      if (filtered.length === 0) {
        if (entries.length === 0) {
          html += '<div class="empty-state"><div class="empty-icon">&#128220;</div><p>暂无审计记录</p><p style="font-size:12px;color:var(--ink-faint);font-style:italic;">当发生删除、演化、合并等治理操作后，这里会出现记录。</p><div style="margin-top:10px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;"><button class="btn btn-primary" data-dashboard-jump="activity">去活动</button><button class="btn" data-dashboard-jump="sessions">去会话</button></div></div>';
        } else {
          html += '<div class="empty-state"><div class="empty-icon">&#128269;</div><p>当前筛选下无结果</p><div style="margin-top:10px;"><button class="btn" data-action="clear-audit-filter">清空筛选</button></div></div>';
        }
      } else {
        filtered.forEach(function(a, idx) {
          var badgeClass = OP_BADGES[a.operation] || 'badge-muted';
          html += '<div class="audit-entry">';
          html += '<div class="audit-head">';
          html += '<span class="badge ' + badgeClass + '">' + esc(a.operation) + '</span>';
          html += '<span style="font-size:12px;color:var(--ink-muted);font-family:var(--font-mono);">' + esc(a.functionId || '') + '</span>';
          html += '<span style="font-size:10px;color:var(--ink-faint);margin-left:auto;font-family:var(--font-mono);">' + esc(formatTime(a.timestamp)) + '</span>';
          html += '<button class="btn" style="font-size:9px;padding:1px 6px;margin-left:8px;" data-action="toggle-audit" data-audit-index="' + idx + '" aria-label="展开详情">&#9660;</button>';
          html += '</div>';
          if (a.targetIds && a.targetIds.length) {
            html += '<div style="font-size:10px;color:var(--ink-faint);font-family:var(--font-mono);">' + a.targetIds.length + ' 个目标: ' + esc(a.targetIds.slice(0, 3).join(', ')) + (a.targetIds.length > 3 ? '...' : '') + '</div>';
          }
          html += '<div class="audit-detail" id="audit-detail-' + idx + '"><pre>' + esc(JSON.stringify(a.details || {}, null, 2)) + '</pre></div>';
          html += '</div>';
        });
      }
      html += '</div>';

      el.innerHTML = html;

      document.getElementById('audit-op-filter').addEventListener('change', function() {
        state.audit.opFilter = this.value;
        renderAudit();
      });
    }

    function toggleAuditDetail(idx) {
      var el = document.getElementById('audit-detail-' + idx);
      if (el) el.classList.toggle('open');
    }

    async function loadProfile() {
      var el = document.getElementById('view-profile');
      el.innerHTML = '<div class="loading">加载画像中...</div>';
      var sessResult = await apiGet('sessions');
      var sessions = (sessResult && sessResult.sessions) || [];

      var projects = {};
      sessions.forEach(function(s) { if (s.project) projects[s.project] = true; });
      state.profile.projects = Object.keys(projects).sort();
      state.profile.loaded = true;

      if (state.profile.projects.length > 0 && !state.profile.selectedProject) {
        state.profile.selectedProject = state.profile.projects[0];
      }

      renderProfileToolbar();
      if (state.profile.selectedProject) await loadProfileData();
    }

    function renderProfileToolbar() {
      var el = document.getElementById('view-profile');
      var html = '<div class="toolbar">';
      html += '<select id="profile-project">';
      if (state.profile.projects.length === 0) {
        html += '<option value="">暂无项目</option>';
      } else {
        state.profile.projects.forEach(function(p) {
          html += '<option value="' + esc(p) + '"' + (state.profile.selectedProject === p ? ' selected' : '') + '>' + esc(p) + '</option>';
        });
      }
      html += '</select></div>';
      html += '<div id="profile-content"></div>';
      el.innerHTML = html;

      document.getElementById('profile-project').addEventListener('change', function() {
        state.profile.selectedProject = this.value;
        loadProfileData();
      });
    }

    async function loadProfileData() {
      var content = document.getElementById('profile-content');
      if (!content || !state.profile.selectedProject) return;
      content.innerHTML = '<div class="loading">加载画像数据中...</div>';
      var result = await apiGet('profile?project=' + encodeURIComponent(state.profile.selectedProject));
      state.profile.data = (result && result.profile) ? result.profile : result;
      renderProfile();
    }

    function renderProfile() {
      var content = document.getElementById('profile-content');
      if (!content) return;
      var p = state.profile.data;

      if (!p) {
        content.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128203;</div><p>该项目暂无画像数据</p></div>';
        return;
      }

      var html = '<div class="two-col">';

      html += '<div class="card"><div class="card-title">高频概念</div>';
      var concepts = p.topConcepts || [];
      if (concepts.length === 0) {
        html += '<div style="font-size:13px;color:var(--ink-faint);font-style:italic;">No concepts yet</div>';
      } else {
        var maxC = Math.max.apply(null, concepts.map(function(c) { return c.frequency; })) || 1;
        html += '<div class="bar-chart">';
        concepts.slice(0, 10).forEach(function(c) {
          var pct = Math.round((c.frequency / maxC) * 100);
          html += '<div class="bar-row"><span class="bar-label">' + esc(c.concept) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:var(--yellow);"></div></div><span class="bar-value">' + c.frequency + '</span></div>';
        });
        html += '</div>';
      }
      html += '</div>';

      html += '<div class="card"><div class="card-title">高频文件</div>';
      var files = p.topFiles || [];
      if (files.length === 0) {
        html += '<div style="font-size:13px;color:var(--ink-faint);font-style:italic;">No files yet</div>';
      } else {
        var maxF = Math.max.apply(null, files.map(function(f) { return f.frequency; })) || 1;
        html += '<div class="bar-chart">';
        files.slice(0, 10).forEach(function(f) {
          var pct = Math.round((f.frequency / maxF) * 100);
          html += '<div class="bar-row"><span class="bar-label">' + esc(f.file.split('/').pop()) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:var(--green);"></div></div><span class="bar-value">' + f.frequency + '</span></div>';
        });
        html += '</div>';
      }
      html += '</div>';

      html += '</div>';

      html += '<div class="card" style="margin-top:16px;"><div class="card-title">约定</div>';
      var conventions = p.conventions || [];
      if (conventions.length === 0) {
        html += '<div style="font-size:13px;color:var(--ink-faint);font-style:italic;">No conventions detected yet</div>';
      } else {
        html += '<ul style="padding-left:16px;">';
        conventions.forEach(function(c) { html += '<li style="font-size:13px;color:var(--ink-muted);margin-bottom:4px;">' + esc(c) + '</li>'; });
        html += '</ul>';
      }
      html += '</div>';

      if (p.summary) {
        html += '<div class="card" style="margin-top:16px;"><div class="card-title">项目摘要</div>';
        html += '<p style="font-size:13px;color:var(--ink-muted);line-height:1.7;">' + esc(p.summary) + '</p></div>';
      }

      var stats = '<div class="card" style="margin-top:16px;"><div class="card-title">项目统计</div>';
      stats += '<div class="detail-row"><div class="dl">Sessions</div><div class="dv" style="font-family:var(--font-mono);">' + (p.sessionCount || 0) + '</div></div>';
      stats += '<div class="detail-row"><div class="dl">Total Obs</div><div class="dv" style="font-family:var(--font-mono);">' + (p.totalObservations || 0) + '</div></div>';
      stats += '<div class="detail-row"><div class="dl">Updated</div><div class="dv" style="font-family:var(--font-mono);font-size:12px;">' + esc(formatTime(p.updatedAt)) + '</div></div>';
      stats += '</div>';

      content.innerHTML = html + stats;
    }

    var wsReconnectTimer = null;
    var wsRetries = 0;
    var WS_MAX_RETRIES = 4;
    var directFailed = false;
    var directFailures = 0;
    var DIRECT_FAILURE_THRESHOLD = 2;
    var pollTimer = null;
    var POLL_INTERVAL_MS = 10000;

    function setWsStatus(text, cls) {
      var el = document.getElementById('ws-status');
      if (!el) return;
      el.textContent = text;
      el.className = 'ws-status ' + cls;
    }

    var WS_REPROBE_EVERY_TICKS = 6;

    function startPolling() {
      if (pollTimer) return;
      setWsStatus('polling · ' + (POLL_INTERVAL_MS / 1000) + 's', 'disconnected');
      var tick = 0;
      pollTimer = setInterval(function() {
        tick++;
        refreshActiveTab('poll');
        if (tick % WS_REPROBE_EVERY_TICKS === 0) {
          var ws = state.ws;
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            wsRetries = 0;
            directFailures = 0;
            directFailed = false;
            connectWs();
          }
        }
      }, POLL_INTERVAL_MS);
    }

    function stopPolling() {
      if (!pollTimer) return;
      clearInterval(pollTimer);
      pollTimer = null;
    }

    var WS_CONNECT_TIMEOUT_MS = 5000;

    function connectWs() {
      if (wsRetries >= WS_MAX_RETRIES) {
        startPolling();
        return;
      }
      var useDirect = !directFailed;
      var ws;
      try {
        ws = new WebSocket(useDirect ? WS_DIRECT_URL : WS_URL);
        ws.__direct = useDirect;
      } catch (_) {
        ws = new WebSocket(WS_URL);
        ws.__direct = false;
      }
      var connectTimer = setTimeout(function() {
        if (ws.readyState === WebSocket.CONNECTING) {
          try { ws.close(); } catch {}
        }
      }, WS_CONNECT_TIMEOUT_MS);
      try {
        ws.onopen = function() {
          clearTimeout(connectTimer);
          if (state.ws !== ws) return;
          wsRetries = 0;
          stopPolling();
          if (ws.__direct) {
            directFailures = 0;
            directFailed = false;
          }
          if (!ws.__direct) {
            ws.send(JSON.stringify({
              type: 'join',
              data: {
                subscriptionId: 'viewer-' + Date.now(),
                streamName: 'mem-live',
                groupId: 'viewer'
              }
            }));
          }
          setWsStatus('live', 'connected');
        };
        ws.onmessage = function(e) {
          if (state.ws !== ws) return;
          try {
            var msg = JSON.parse(e.data);
            if (msg.type === 'stream' && msg.event) {
              handleStreamEvent(msg);
            } else if (msg.event_type && msg.data) {
              handleStreamEvent({ event: { type: 'create', data: msg.data, event_type: msg.event_type } });
            }
          } catch {}
        };
        ws.onclose = function() {
          clearTimeout(connectTimer);
          if (state.ws !== ws) return;
          if (ws.__direct) {
            directFailures += 1;
            if (directFailures >= DIRECT_FAILURE_THRESHOLD) {
              directFailed = true;
            }
          }
          wsRetries++;
          if (wsRetries < WS_MAX_RETRIES) {
            setWsStatus('connecting...', 'disconnected');
            wsReconnectTimer = setTimeout(connectWs, 2000 + Math.min(wsRetries * 1000, 8000));
          } else {
            startPolling();
          }
        };
        ws.onerror = function() {
          if (state.ws !== ws) return;
          try { ws.close(); } catch {}
        };
        state.ws = ws;
      } catch {
        wsRetries++;
        if (wsRetries < WS_MAX_RETRIES) {
          wsReconnectTimer = setTimeout(connectWs, 2000 + Math.min(wsRetries * 1000, 8000));
        } else {
          startPolling();
        }
      }
    }

    function looksLikeObservation(obj) {
      return !!(obj && typeof obj === 'object' && obj.id && obj.timestamp);
    }

    function handleStreamEvent(msg) {
      var evt = msg.event;
      var observation;
      if (!evt) return;
      if (evt.event_type && evt.event_type !== 'observation' && evt.event_type !== 'create' && evt.event_type !== 'update') {
        return;
      }
      if (evt.type === 'event' && evt.data) {
        observation = evt.data.observation || evt.data;
        if (looksLikeObservation(observation)) {
          routeWsMessage({ observation: observation });
        }
        return;
      }
      if ((evt.type === 'create' || evt.type === 'update') && evt.data) {
        var payload = evt.data;
        observation = payload.observation || payload;
        if (looksLikeObservation(observation)) {
          routeWsMessage({ observation: observation });
        }
      } else if (evt.type === 'sync') {
        var items = Array.isArray(evt.data) ? evt.data : [];
        items.forEach(function(item) {
          var payload = item.data || item;
          observation = payload.observation || payload;
          if (looksLikeObservation(observation)) {
            routeWsMessage({ observation: observation });
          }
        });
      }
    }

    function routeWsMessage(msg) {
      markMemoryViewsStale();
      if (state.activeTab === 'timeline' && msg.observation) {
        if (!state.timeline.sessionId || msg.observation.sessionId === state.timeline.sessionId) {
          var existing = state.timeline.observations.findIndex(function(o) { return o.id === msg.observation.id; });
          if (existing >= 0) {
            state.timeline.observations[existing] = msg.observation;
          } else {
            state.timeline.observations.unshift(msg.observation);
          }
          renderObservations();
        }
      }
      if (state.activeTab === 'dashboard') {
        loadDashboard();
      }
      if (state.activeTab === 'memories') loadMemories();
      if (state.activeTab === 'sessions') {
        if (isViewingSessionDetail()) {
          markSessionsStale();
        } else {
          state.sessions.loaded = false;
          loadSessions({ showLoading: false, reason: 'ws' });
        }
      }
      if (state.activeTab === 'lessons') loadLessons();
      if (state.activeTab === 'actions') markActionsStale('有新会话记录，待办暂未自动刷新。');
      if (state.activeTab === 'activity' && msg.observation) {
        state.activity.observations.unshift(msg.observation);
        renderActivity();
      }
    }

    document.getElementById('tab-bar').addEventListener('click', function(e) {
      var toggle = e.target instanceof Element ? e.target.closest('#expert-toggle') : null;
      if (toggle) {
        toggleExpertMode();
        return;
      }
      var btn = e.target instanceof Element ? e.target.closest('button[data-tab]') : null;
      if (btn) {
        switchTab(btn.dataset.tab);
        return;
      }
    });

    document.addEventListener('click', function(e) {
      if (!(e.target instanceof Element)) return;
      var jump = e.target.closest('[data-dashboard-jump]');
      if (!jump) return;
      var tab = jump.getAttribute('data-dashboard-jump');
      if (!tab) return;
      switchTab(tab);
    });

    document.querySelectorAll('[data-tab-link]').forEach(function(link) {
      link.addEventListener('click', function(e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        switchTab(link.getAttribute('data-tab-link'));
      });
    });

    function syncTabFromRoute() {
      switchTab(tabFromRoute(), { replaceRoute: true });
    }
    window.addEventListener('hashchange', syncTabFromRoute);
    window.addEventListener('popstate', syncTabFromRoute);

    // --- Feature flag banners ---------------------------------------------
    function getDismissedFlags() {
      if (!state.flagsDismissed) state.flagsDismissed = {};
      return state.flagsDismissed;
    }
    function dismissFlags(keys) {
      var dismissed = getDismissedFlags();
      keys.forEach(function(key) {
        if (key) dismissed[key] = true;
      });
    }
    function renderFlagBanners(cfg) {
      var host = document.getElementById('flag-banners');
      if (!host) return;
      var dismissed = getDismissedFlags();
      var banners = [];
      function toHumanTitle(raw) {
        if (!raw) return '功能未开启';
        var key = String(raw).toLowerCase();
        if (key.indexOf('knowledge graph') >= 0) return '关系图自动提取未开启';
        if (key.indexOf('llm provider') >= 0) return '智能分析未开启';
        if (key.indexOf('bm25-only') >= 0) return '仅关键词检索模式';
        return raw;
      }
      function toHumanDesc(raw) {
        if (!raw) return '开启后可获得更完整的记忆分析能力。';
        var s = String(raw);
        if (s.indexOf('Compression, summarization, and graph extraction') >= 0) {
          return '当前只能使用基础能力；摘要、压缩和关系图能力暂不可用。';
        }
        if (s.indexOf('Extracts entities and relations') >= 0) {
          return '系统暂不会自动生成关系图。';
        }
        if (s.indexOf('Semantic vector search is off') >= 0) {
          return '当前搜索偏向关键词匹配，语义理解能力较弱。';
        }
        return s;
      }
      // Per-flag banner (only for off flags, affecting current tab or dashboard)
      (cfg.flags || []).forEach(function(f) {
        if (f.enabled) return;
        if (dismissed[f.key]) return;
        var tabsAffected = (f.affects || []).map(function(t) { return t.toLowerCase(); });
        if (tabsAffected.length && tabsAffected.indexOf(state.activeTab) === -1 && state.activeTab !== 'dashboard') return;
        banners.push({
          kind: 'warn',
          icon: '&#9673;',
          title: toHumanTitle(f.label),
          keyLabel: f.key,
          desc: toHumanDesc(f.description) + (f.needsLlm ? ' 需要先连接智能模型。' : ''),
          enable: f.enableHow,
          docs: f.docsHref,
          dismissKey: f.key,
        });
      });
      if (cfg.provider === 'noop' && !dismissed['__provider_noop']) {
        banners.unshift({
          kind: 'warn',
          icon: '&#9673;',
          title: '智能分析未开启',
          keyLabel: 'ANTHROPIC_API_KEY',
          desc: '当前只能用基础功能；摘要、关系图与自动提炼暂不可用。',
          enable: 'export ANTHROPIC_API_KEY=sk-ant-...\n# then restart: npm run start:local-memory',
          docs: 'https://github.com/MaimoryLab/agentmemory-lab#quick-start',
          dismissKey: '__provider_noop',
        });
      }
      if (cfg.embeddingProvider === 'none' && !dismissed['__embedding_none']) {
        banners.push({
          kind: 'info',
          icon: '&#9673;',
          title: '仅关键词检索模式',
          keyLabel: 'OPENAI_API_KEY',
          desc: '当前搜索偏向关键词匹配，语义理解能力较弱。',
          enable: 'export OPENAI_API_KEY=sk-...\n# or VOYAGE_API_KEY, COHERE_API_KEY, OLLAMA_HOST',
          docs: 'https://github.com/MaimoryLab/agentmemory-lab#embedding-providers',
          dismissKey: '__embedding_none',
        });
      }
      if (banners.length === 0) { host.innerHTML = ''; return; }
      var warnCount = banners.filter(function(b) { return b.kind === 'warn'; }).length;
      var infoCount = banners.filter(function(b) { return b.kind === 'info'; }).length;
      var expanded = host.getAttribute('data-expanded') === '1';
      var pills = '';
      if (warnCount) pills += '<span class="flag-pill">' + warnCount + ' 项待开启</span>';
      if (infoCount) pills += '<span class="flag-pill info">' + infoCount + ' 条提示</span>';
      var escHtml = function(s) {
        return String(s).replace(/[<>&"]/g, function(c) {
          return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
        });
      };
      var listHtml = banners.map(function(b) {
        return '<div class="flag-banner ' + b.kind + '" data-flag="' + escHtml(b.dismissKey) + '">' +
          '<span class="flag-icon">' + b.icon + '</span>' +
          '<div class="flag-body">' +
            '<div class="flag-title">' + escHtml(b.title) + '</div>' +
            '<div class="flag-desc">' + escHtml(b.desc) + '</div>' +
            '<code class="flag-enable">' + escHtml(b.enable) + '</code>' +
            (b.docs ? ' <a class="empty-link" href="' + escHtml(b.docs) + '" target="_blank" rel="noopener">查看设置步骤</a>' : '') +
          '</div>' +
          '<button type="button" class="flag-close" data-dismiss-flag="' + escHtml(b.dismissKey) + '" aria-label="关闭">&times;</button>' +
        '</div>';
      }).join('');
      host.innerHTML = '<button type="button" class="flag-summary" data-action="toggle-flags" aria-expanded="' + (expanded ? 'true' : 'false') + '" aria-controls="flag-list">' +
          pills +
          '<span class="flag-count">高级能力设置</span>' +
          '<span style="color:var(--ink-faint);">— ' + (expanded ? '收起' : '展开') + '</span>' +
          '<span class="flag-toggle" aria-hidden="true">' + (expanded ? '&#9650;' : '&#9660;') + '</span>' +
        '</button>' +
        '<div class="flag-list' + (expanded ? ' open' : '') + '" id="flag-list">' + listHtml + '</div>';
    }
    async function fetchFlags() {
      var res = await apiGet('config/flags');
      if (!res) return;
      state.flagsConfig = res;
      renderFlagBanners(res);
      updateFooter(res);
    }
    function updateFooter(cfg) {
      var fbEl = document.getElementById('footer-feedback');
      if (fbEl) {
        var flagSummary = (cfg.flags || []).map(function(f) { return f.key + '=' + (f.enabled ? 'on' : 'off'); }).join(', ');
        var body = encodeURIComponent(
          '**Version:** ' + (cfg.version || '?') + '\n' +
          '**Provider:** ' + (cfg.provider || '?') + '\n' +
          '**Embedding:** ' + (cfg.embeddingProvider || '?') + '\n' +
          '**Flags:** ' + flagSummary + '\n' +
          '**User agent:** ' + navigator.userAgent + '\n\n' +
          '### What went wrong\n\n' +
          '(describe the issue)\n\n' +
          '### Steps to reproduce\n\n' +
          '1. \n2. \n3. \n'
        );
        fbEl.href = 'https://github.com/MaimoryLab/agentmemory-lab/issues/new?title=' +
          encodeURIComponent('[viewer] ') + '&body=' + body;
      }
    }
    document.addEventListener('click', function(e) {
      if (!(e.target instanceof Element)) return;
      var btn = e.target.closest('[data-dismiss-flag]');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        var key = btn.getAttribute('data-dismiss-flag');
        dismissFlags([key]);
        if (state.flagsConfig) renderFlagBanners(state.flagsConfig);
        return;
      }
      var toggle = e.target.closest('[data-action="toggle-flags"]');
      if (toggle) {
        var host = document.getElementById('flag-banners');
        var cur = host.getAttribute('data-expanded') === '1';
        host.setAttribute('data-expanded', cur ? '0' : '1');
        if (state.flagsConfig) renderFlagBanners(state.flagsConfig);
      }
    });
    fetchFlags();
    document.addEventListener('click', function(e) {
      if (!(e.target instanceof Element)) return;
      var target = e.target.closest('[data-action]');
      if (!target) return;
      var action = target.getAttribute('data-action');
      if (!action) return;

      if (action === 'toggle-theme') {
        toggleTheme();
        return;
      }
      if (action === 'clear-audit-filter') {
        state.audit.opFilter = '';
        renderAudit();
        return;
      }
      if (action === 'refresh-audit') {
        state.audit.loaded = false;
        loadAudit();
        return;
      }
      if (action === 'refresh-dashboard') {
        refreshDashboard();
        return;
      }
      if (action === 'refresh-activity') {
        state.activity.loaded = false;
        loadActivity();
        return;
      }
      if (action === 'refresh-actions') {
        state.actions.loaded = false;
        loadActions({ generate: false });
        return;
      }
      if (action === 'extract-actions') {
        startTodoExtraction(true);
        return;
      }
      if (action === 'update-cards') {
        startTodoUpdate();
        return;
      }
      if (action === 'toggle-settings') {
        state.settings.open = !state.settings.open;
        renderSettingsPanel();
        if (state.settings.open && !state.actions.config) {
          loadTodoExtractorConfig().then(renderSettingsPanel).catch(function() {});
        }
        return;
      }
      if (action === 'close-settings') {
        state.settings.open = false;
        renderSettingsPanel();
        return;
      }
      if (action === 'set-ui-language') {
        var lang = target.getAttribute('data-lang') || '';
        if (lang === 'zh' || lang === 'en') {
          I18N_LANG = lang;
          try { localStorage.setItem('agentmemory-lang', lang); } catch (_) {}
          applyI18n(document);
          renderSettingsPanel();
          if (state.activeTab === 'actions') renderActions();
          if (state.activeTab === 'dashboard') renderDashboard();
          if (state.activeTab === 'sessions') renderSessions();
        }
        return;
      }
      if (action === 'save-todo-config') {
        saveTodoExtractorConfig();
        return;
      }
      if (action === 'action-status') {
        updateActionStatus(target.getAttribute('data-action-id') || '', target.getAttribute('data-status') || '');
        return;
      }
      if (action === 'refresh-sessions') {
        state.sessions.loaded = false;
        loadSessions({ showLoading: true, reason: 'manual' });
        return;
      }
      if (action === 'open-session-group') {
        var openSessionId = target.getAttribute('data-session-id') || '';
        if (openSessionId) state.sessions.selectedId = openSessionId;
        state.sessions.loaded = false;
        switchTab('sessions');
        return;
      }
      if (action === 'jump-to-evidence') {
        jumpToEvidence(target.getAttribute('data-obs-id') || '');
        return;
      }
      if (action === 'inbox-reply') {
        openInboxReply(target.getAttribute('data-inbox-id') || '');
        return;
      }
      if (action === 'inbox-reply-submit') {
        submitInboxReply(target.getAttribute('data-inbox-id') || '');
        return;
      }
      if (action === 'inbox-reply-cancel') {
        cancelInboxReply();
        return;
      }
      if (action === 'inbox-ack') {
        ackInboxItem(target.getAttribute('data-inbox-id') || '');
        return;
      }
      if (action === 'inbox-to-todo') {
        convertInboxToTodo(target.getAttribute('data-inbox-id') || '');
        return;
      }
      if (action === 'toggle-done-today') {
        state.actions.doneExpanded = !state.actions.doneExpanded;
        renderActions();
        return;
      }
      if (action === 'toggle-briefings') {
        state.inbox.briefingExpanded = !state.inbox.briefingExpanded;
        renderActions();
        return;
      }
      if (action === 'toggle-inbox-archive') {
        state.inbox.answeredExpanded = !state.inbox.answeredExpanded;
        renderActions();
        return;
      }
      if (action === 'toggle-session-detail-section') {
        toggleSessionDetailSection(
          target.getAttribute('data-session-id') || state.sessions.selectedId || '',
          target.getAttribute('data-section') || '',
        );
        return;
      }
      if (action === 'toggle-session-preview') {
        toggleSessionPreview(target.getAttribute('data-session-id') || state.sessions.selectedId || '');
        return;
      }
      if (action === 'zoom-graph') {
        zoomGraph(parseInt(target.getAttribute('data-dir') || '0', 10));
        return;
      }
      if (action === 'recenter-graph') {
        recenterGraph();
        return;
      }
      if (action === 'rebuild-graph') {
        rebuildGraph();
        return;
      }
      if (action === 'expand-node') {
        var nodeId = target.getAttribute('data-node-id');
        if (nodeId) expandNode(nodeId);
        return;
      }
      if (action === 'delete-memory') {
        deleteMemory(
          target.getAttribute('data-memory-id') || '',
          target.getAttribute('data-memory-title') || '',
        );
        return;
      }
      if (action === 'edit-memory') {
        var editMemoryId = target.getAttribute('data-memory-id');
        if (editMemoryId) editMemory(editMemoryId);
        return;
      }
      if (action === 'copy-agent-prompt') {
        copyAgentPrompt();
        return;
      }
      if (action === 'copy-skill-path') {
        var skillPath = target.getAttribute('data-skill-path') || '';
        copyTextToClipboard(skillPath).then(function() {
          target.setAttribute('title', '已复制');
          setTimeout(function() { target.setAttribute('title', '复制路径'); }, 1400);
        });
        return;
      }
      if (action === 'open-skill-draft') {
        openSkillDraft(target.getAttribute('data-skill-draft-key') || '通用经验');
        return;
      }
      if (action === 'copy-skill-draft') {
        var draftEl = document.getElementById('skill-draft-preview');
        copyTextToClipboard(draftEl ? draftEl.textContent || '' : '').then(function() {
          target.textContent = '已复制';
          setTimeout(function() { target.textContent = '复制草稿'; }, 1400);
        });
        return;
      }
      if (action === 'open-add-memory') {
        openAddMemory();
        return;
      }
      if (action === 'open-add-lesson') {
        openAddLesson();
        return;
      }
      if (action === 'open-skill-detail') {
        openSkillDetail(target.getAttribute('data-skill-path') || '');
        return;
      }
      if (action === 'filter-skill-root') {
        state.lessons.skillRootFilter = target.getAttribute('data-root') || 'all';
        renderLessons();
        return;
      }
      if (action === 'filter-actions-status') {
        var nextFilter = target.getAttribute('data-status') || '';
        // STEP-13: clicking the already-active filter clears it — with the chip
        // row gone, this is how the metric cards restore the "show all" view.
        state.actions.statusFilter = (state.actions.statusFilter || '') === nextFilter ? '' : nextFilter;
        renderActions();
        return;
      }
      if (action === 'close-modal') {
        closeModal();
        return;
      }
      if (action === 'save-new-memory') {
        saveNewMemory();
        return;
      }
      if (action === 'save-new-lesson') {
        saveNewLesson();
        return;
      }
      if (action === 'save-memory') {
        var saveMemoryId = target.getAttribute('data-memory-id');
        if (saveMemoryId) saveMemory(saveMemoryId);
        return;
      }
      if (action === 'confirm-delete-memory') {
        var memoryId = target.getAttribute('data-memory-id');
        if (memoryId) confirmDeleteMemory(memoryId);
        return;
      }
      if (action === 'edit-review') {
        var editReviewId = target.getAttribute('data-review-id');
        if (editReviewId) editReviewItem(editReviewId);
        return;
      }
      if (action === 'approve-review') {
        var approveId = target.getAttribute('data-review-id');
        if (approveId) approveReviewItem(approveId);
        return;
      }
      if (action === 'dismiss-review') {
        var dismissId = target.getAttribute('data-review-id');
        if (dismissId) dismissReviewItem(dismissId);
        return;
      }
	      if (action === 'timeline-filter') {
	        setTlTypeFilter(target.getAttribute('data-type-filter') || '');
	        return;
	      }
	      if (action === 'episode-filter') {
	        state.timeline.episodeFilter = target.getAttribute('data-episode-filter') || 'all';
	        state.timeline.page = 0;
	        renderObservations();
	        return;
	      }
	      if (action === 'episode-toggle') {
	        var episodeKey = target.getAttribute('data-episode-key');
	        if (episodeKey) {
	          state.timeline.expandedEpisodes[episodeKey] = !state.timeline.expandedEpisodes[episodeKey];
	          renderObservations();
	        }
	        return;
	      }
		      if (action === 'timeline-page') {
	        var page = parseInt(target.getAttribute('data-page') || '', 10);
	        if (!Number.isNaN(page)) tlPage(page);
	        return;
	      }
	      if (action === 'timeline-mode') {
	        var mode = target.getAttribute('data-mode') || 'episodes';
	        state.timeline.mode = mode === 'events' ? 'events' : 'episodes';
	        state.timeline.page = 0;
	        renderTimelineToolbar(groupSessionsByProject(state.timeline.sessions || []));
	        renderObservations();
	        return;
	      }
      if (action === 'select-session') {
        var sessionId = target.getAttribute('data-session-id');
        if (sessionId) selectSession(sessionId);
        return;
      }
      if (action === 'session-group-mode') {
        var sessionMode = target.getAttribute('data-mode') === 'source' ? 'source' : 'folder';
        state.sessions.groupMode = sessionMode;
        renderSessions();
        return;
      }
      if (action === 'select-session-group') {
        var groupKey = target.getAttribute('data-group-key') || 'all';
        if (state.sessions.groupMode === 'source') state.sessions.sourceKey = groupKey;
        else state.sessions.folderKey = groupKey;
        renderSessions();
        return;
      }
      if (action === 'session-jump') {
        var jumpTarget = target.getAttribute('data-target') === 'bottom' ? 'session-detail-bottom' : 'session-detail-top';
        var jumpEl = document.getElementById(jumpTarget);
        if (jumpEl) jumpEl.scrollIntoView({ behavior: 'smooth', block: target.getAttribute('data-target') === 'bottom' ? 'end' : 'start' });
        return;
      }
      if (action === 'end-session') {
        var endSessionId = target.getAttribute('data-session-id');
        if (endSessionId) endSession(endSessionId);
        return;
      }
      if (action === 'summarize-session') {
        var summarizeSessionId = target.getAttribute('data-session-id');
        if (summarizeSessionId) summarizeSession(summarizeSessionId, target);
        return;
      }
      if (action === 'toggle-audit') {
        var auditIndex = parseInt(target.getAttribute('data-audit-index') || '', 10);
        if (!Number.isNaN(auditIndex)) toggleAuditDetail(auditIndex);
      }
      if (action === 'replay-select') {
        var rSid = target.getAttribute('data-session-id');
        if (rSid) selectReplaySession(rSid);
        return;
      }
      if (action === 'replay-toggle-play') { toggleReplayPlay(); return; }
      if (action === 'replay-step') {
        var d = parseInt(target.getAttribute('data-dir') || '1', 10);
        stepReplay(d);
        return;
      }
      if (action === 'replay-speed') {
        var sp = parseFloat(target.getAttribute('data-speed') || '1');
        setReplaySpeed(sp);
        return;
      }
      if (action === 'replay-reset') { resetReplay(); return; }
      if (action === 'replay-import') { runReplayImport(); return; }
      if (action === 'replay-refresh') { refreshReplaySessions(); return; }
    });
    document.getElementById('modal-overlay').addEventListener('click', function(e) {
      if (e.target === this) closeModal();
    });
    document.addEventListener('input', function(e) {
      var target = e.target;
      if (!target || !target.id || String(target.id).indexOf('todo-config-') !== 0) return;
      state.actions.configDraft = state.actions.configDraft || {};
      state.actions.configDraft[String(target.id).slice('todo-config-'.length)] = String(target.value || '');
    });

    async function loadReplay() {
      var el = document.getElementById('view-replay');
      el.innerHTML = '<div class="loading">加载会话列表中…</div>';
      var res = await apiGet('replay/sessions');
      state.replay.sessions = (res && res.sessions) || [];
      state.replay.loaded = true;
      renderReplay();
    }

    async function refreshReplaySessions() {
      state.replay.loaded = false;
      await loadReplay();
    }

    function renderReplay() {
      var el = document.getElementById('view-replay');
      var sessions = state.replay.sessions || [];
      var options = '<option value="">— pick a session —</option>' + sessions.map(function(s) {
        var id = sessionId(s);
        var label = sessionDisplayName(s) + ' · ' + (shortSessionId(s, 8) || '无记录 ID') + ' · ' + (s.observationCount || 0) + ' obs';
        return '<option value="' + esc(id) + '"' + (id && id === state.replay.selectedId ? ' selected' : '') + (id ? '' : ' disabled') + '>' + esc(label) + '</option>';
      }).join('');

      var tl = state.replay.timeline;
      var hasTl = tl && tl.events && tl.events.length > 0;
      var cursorEvent = hasTl ? tl.events[Math.min(state.replay.cursor, tl.events.length - 1)] : null;
      var progress = hasTl && tl.totalDurationMs > 0 ? Math.min(100, (state.replay.offsetAt / tl.totalDurationMs) * 100) : 0;

      el.innerHTML =
        '<div class="toolbar">' +
          '<select id="replay-session-select">' + options + '</select>' +
          '<button data-action="replay-refresh">刷新</button>' +
          '<span class="sep"></span>' +
          '<input type="text" id="replay-import-path" placeholder="~/.claude/projects 或 file.jsonl" style="width:280px">' +
          '<button data-action="replay-import">导入 JSONL</button>' +
        '</div>' +
        (hasTl
          ? '<div class="replay-controls">' +
              '<button data-action="replay-step" data-dir="-1" title="上一步 (←)">◀</button>' +
              '<button data-action="replay-toggle-play" title="播放/暂停 (空格)">' + (state.replay.playing ? '❚❚ 暂停' : '▶ 播放') + '</button>' +
              '<button data-action="replay-step" data-dir="1" title="下一步 (→)">▶</button>' +
              '<button data-action="replay-reset" title="重置">⟲</button>' +
              '<span class="sep"></span>' +
              '<span>速度</span>' +
              ['0.5', '1', '2', '4'].map(function(sp) {
                var active = Math.abs(state.replay.speed - parseFloat(sp)) < 0.01;
                return '<button data-action="replay-speed" data-speed="' + sp + '"' + (active ? ' class="active"' : '') + '>' + sp + '×</button>';
              }).join('') +
              '<span class="sep"></span>' +
              '<span>' + (state.replay.cursor + 1) + ' / ' + tl.eventCount + '</span>' +
            '</div>' +
            '<div class="replay-progress"><div class="replay-progress-bar" style="width:' + progress.toFixed(1) + '%"></div></div>' +
            '<div class="replay-grid">' +
              '<div class="replay-list" id="replay-list">' +
                tl.events.map(function(ev, i) {
                  var active = i === state.replay.cursor ? ' replay-event-active' : '';
                  return '<div class="replay-event replay-event-' + esc(ev.kind) + active + '" data-replay-idx="' + i + '">' +
                    '<span class="replay-event-kind">' + esc(ev.kind) + '</span>' +
                    '<span class="replay-event-label">' + esc(ev.label) + '</span>' +
                    '<span class="replay-event-time">' + (ev.offsetMs / 1000).toFixed(1) + 's</span>' +
                  '</div>';
                }).join('') +
              '</div>' +
              '<div class="replay-detail">' + renderReplayDetail(cursorEvent) + '</div>' +
            '</div>'
          : '<div class="empty">请选择一个会话进行回放，或从 ~/.claude/projects 导入 Claude Code 的 JSONL 记录。</div>');

      var sel = document.getElementById('replay-session-select');
      if (sel) sel.addEventListener('change', function() { selectReplaySession(sel.value); });
    }

    function renderReplayDetail(ev) {
      if (!ev) return '<div class="empty">尚未选择事件。</div>';
      var blocks = [];
      blocks.push('<div class="replay-detail-header"><b>' + esc(ev.label) + '</b> <span class="muted">' + esc(ev.kind) + '</span></div>');
      if (ev.ts) blocks.push('<div class="muted">' + esc(formatTime(ev.ts)) + '</div>');
      if (ev.body) {
        blocks.push('<pre class="replay-body">' + esc(ev.body) + '</pre>');
      }
      if (ev.toolName) {
        blocks.push('<div class="replay-tool"><b>工具：</b> ' + esc(ev.toolName) + '</div>');
      }
      if (ev.toolInput !== undefined && ev.toolInput !== null) {
        var inp = typeof ev.toolInput === 'string' ? ev.toolInput : JSON.stringify(ev.toolInput, null, 2);
        blocks.push('<div class="replay-tool-block"><b>输入</b><pre>' + esc(truncate(inp, 4000)) + '</pre></div>');
      }
      if (ev.toolOutput !== undefined && ev.toolOutput !== null) {
        var out = typeof ev.toolOutput === 'string' ? ev.toolOutput : JSON.stringify(ev.toolOutput, null, 2);
        blocks.push('<div class="replay-tool-block"><b>输出</b><pre>' + esc(truncate(out, 4000)) + '</pre></div>');
      }
      return blocks.join('');
    }

    async function selectReplaySession(sessionId) {
      stopReplayTimer();
      state.replay.selectedId = sessionId;
      state.replay.timeline = null;
      state.replay.cursor = 0;
      state.replay.offsetAt = 0;
      state.replay.playing = false;
      if (!sessionId) { renderReplay(); return; }
      var el = document.getElementById('view-replay');
      el.innerHTML = '<div class="loading">加载回放中…</div>';
      var res = await apiGet('replay/load?sessionId=' + encodeURIComponent(sessionId));
      if (res && res.success && res.timeline) {
        state.replay.timeline = res.timeline;
      } else {
        state.replay.timeline = { events: [], eventCount: 0, totalDurationMs: 0 };
      }
      renderReplay();
    }

    function toggleReplayPlay() {
      if (!state.replay.timeline || state.replay.timeline.eventCount === 0) return;
      if (state.replay.playing) {
        stopReplayTimer();
      } else {
        startReplayTimer();
      }
      renderReplay();
    }

    function startReplayTimer() {
      state.replay.playing = true;
      state.replay.startAt = Date.now();
      var baseOffset = state.replay.offsetAt;
      if (state.replay.timer) clearInterval(state.replay.timer);
      state.replay.timer = setInterval(function() {
        if (!state.replay.timeline) return;
        var elapsed = (Date.now() - state.replay.startAt) * state.replay.speed;
        state.replay.offsetAt = baseOffset + elapsed;
        var events = state.replay.timeline.events;
        var newCursor = state.replay.cursor;
        for (var i = newCursor; i < events.length; i++) {
          if (events[i].offsetMs <= state.replay.offsetAt) newCursor = i;
          else break;
        }
        var changed = newCursor !== state.replay.cursor;
        state.replay.cursor = newCursor;
        if (state.replay.offsetAt >= state.replay.timeline.totalDurationMs) {
          state.replay.offsetAt = state.replay.timeline.totalDurationMs;
          stopReplayTimer();
          renderReplay();
          return;
        }
        if (changed) renderReplay();
      }, 100);
    }

    function stopReplayTimer() {
      state.replay.playing = false;
      if (state.replay.timer) {
        clearInterval(state.replay.timer);
        state.replay.timer = null;
      }
    }

    function stepReplay(dir) {
      if (!state.replay.timeline) return;
      stopReplayTimer();
      var next = state.replay.cursor + dir;
      if (next < 0) next = 0;
      if (next >= state.replay.timeline.eventCount) next = state.replay.timeline.eventCount - 1;
      state.replay.cursor = next;
      state.replay.offsetAt = state.replay.timeline.events[next].offsetMs;
      renderReplay();
    }

    function setReplaySpeed(sp) {
      if (!sp || sp <= 0) return;
      var wasPlaying = state.replay.playing;
      stopReplayTimer();
      state.replay.speed = sp;
      if (wasPlaying) startReplayTimer();
      renderReplay();
    }

    function resetReplay() {
      stopReplayTimer();
      state.replay.cursor = 0;
      state.replay.offsetAt = 0;
      renderReplay();
    }

    async function runReplayImport() {
      var input = document.getElementById('replay-import-path');
      var pathVal = input ? input.value.trim() : '';
      var body = {};
      if (pathVal) body.path = pathVal;
      var el = document.getElementById('view-replay');
      var prior = el.innerHTML;
      el.innerHTML = '<div class="loading">Importing JSONL…</div>';
      var res = await apiPost('replay/import-jsonl', body);
      if (!res || res.success === false) {
        el.innerHTML = prior;
        alert((res && res.error) || '导入失败');
        return;
      }
      alert('已导入 ' + (res.imported || 0) + ' 个文件，生成 ' + (res.observations || 0) + ' 条观察记录');
      await refreshReplaySessions();
    }

    document.addEventListener('keydown', function(e) {
      if (state.activeTab !== 'replay') return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === ' ') { e.preventDefault(); toggleReplayPlay(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepReplay(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepReplay(1); }
    });

    // 总览页下拉刷新（顶部向下滑动触发）
    var dashPullStartY = null;
    var dashPullStartTop = false;
    var dashPullTriggered = false;
    var dashPullCooldownAt = 0;
    document.addEventListener('touchstart', function(e) {
      if (state.activeTab !== 'dashboard') return;
      if (!e.touches || e.touches.length !== 1) return;
      var scTop = (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0);
      dashPullStartTop = scTop <= 2;
      dashPullStartY = e.touches[0].clientY;
      dashPullTriggered = false;
    }, { passive: true });
    document.addEventListener('touchmove', function(e) {
      if (state.activeTab !== 'dashboard') return;
      if (!dashPullStartTop || dashPullStartY === null || dashPullTriggered) return;
      if (!e.touches || e.touches.length !== 1) return;
      var dy = e.touches[0].clientY - dashPullStartY;
      if (dy < 72) return;
      var now = Date.now();
      if (now - dashPullCooldownAt < 1200) return;
      dashPullTriggered = true;
      dashPullCooldownAt = now;
      refreshDashboard();
    }, { passive: true });
    document.addEventListener('touchend', function() {
      dashPullStartY = null;
      dashPullStartTop = false;
      dashPullTriggered = false;
    }, { passive: true });

    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        refreshActiveTab('visibility');
      }
    });

    renderExpertTabs();
    switchTab(tabFromRoute(), { replaceRoute: true });
    connectWs();
    startDashboardAutoRefresh();
