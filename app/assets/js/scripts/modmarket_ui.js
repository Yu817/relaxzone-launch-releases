(() => {
    'use strict'

    // Requirements (scoped safely inside IIFE to prevent variable collision with other scripts)
    const ModMarket = require('./assets/js/modmarket')
    const { shell } = require('electron')

    console.log('[ModMarketUI] Script initialized within isolated scope!')

    let marketState = {
        query: '',
        category: 'all',
        sort: 'downloads',
        offset: 0,
        limit: 24,
        total: 0,
        loading: false,
        hits: []
    }

    // Modal state for version selection
    let modalState = {
        projectId: null,
        title: null,
        iconUrl: null,
        versions: [],
        details: null,
        verFilter: '12111',
        channelFilter: 'all',
        loading: false
    }

    let searchDebounceTimer = null
    let marketInitialized = false

    /**
     * Escape HTML special characters
     */
    function escapeHtml(str) {
        if (!str) return ''
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
    }

    /**
     * Format bytes to readable strings (e.g. 1.82 MB, 450 KB)
     */
    function formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    /**
     * Format large numbers to readable strings (e.g. 1.2M, 45.3K)
     */
    function formatCount(num) {
        if (!num) return '0'
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M'
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K'
        }
        return String(num)
    }

    /**
     * Format ISO date string to readable YYYY-MM-DD
     */
    function formatDate(isoStr) {
        if (!isoStr) return ''
        try {
            const d = new Date(isoStr)
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            return `${y}-${m}-${day}`
        } catch (e) {
            return isoStr.slice(0, 10)
        }
    }

    /**
     * Update the installed counter badge on the category chip
     */
    function updateInstalledCountBadge() {
        const badge = document.getElementById('rz_market_installed_count')
        if (badge) {
            badge.innerText = ModMarket.getInstalledCount()
        }
    }

    /**
     * Show a quick toast notification
     */
    function showMarketToast(text, isError = false) {
        const toast = document.getElementById('rz_market_toast')
        const toastText = document.getElementById('rz_market_toast_text')
        if (!toast || !toastText) return

        toastText.innerText = text
        toast.className = 'rz_market_toast' + (isError ? ' rz_toast_error' : '')
        toast.classList.add('rz_toast_visible')

        clearTimeout(toast._timer)
        toast._timer = setTimeout(() => {
            toast.classList.remove('rz_toast_visible')
        }, 3200)
    }

    /**
     * Render hits to grid (with XMCL-style dual action buttons: ⚡ 推薦安裝 + 📋 選擇版本)
     */
    function renderMarketGrid(append = false) {
        const grid = document.getElementById('rz_market_grid')
        const loadMoreBtn = document.getElementById('rz_market_load_more_btn')
        const emptyBox = document.getElementById('rz_market_empty')

        if (!append && grid) {
            grid.innerHTML = ''
        }

        if (!marketState.hits || marketState.hits.length === 0) {
            if (emptyBox) emptyBox.style.display = 'flex'
            if (loadMoreBtn) loadMoreBtn.style.display = 'none'
            updateInstalledCountBadge()
            return
        } else {
            if (emptyBox) emptyBox.style.display = 'none'
        }

        let cardsHtml = ''

        for (const hit of marketState.hits) {
            const iconSrc = hit.icon_url || './assets/images/SealCircle.png'
            const cats = (hit.categories || []).slice(0, 3).map(c => `<span class="rz_card_cat_pill">${escapeHtml(c)}</span>`).join('')
            const safeTitle = escapeHtml(hit.title)
            const safeAuthor = escapeHtml(hit.author)
            const safeDesc = escapeHtml(hit.description || '尚無詳細說明。')
            const safeId = escapeHtml(hit.id)
            
            cardsHtml += `
                <div class="rz_mod_card ${hit.isInstalled ? 'rz_card_installed' : ''}" id="mod_card_${safeId}" data-id="${safeId}">
                    <div class="rz_mod_card_top rz_clickable_card_header" data-id="${safeId}" data-title="${safeTitle}" title="點擊檢視版本與詳情">
                        <img class="rz_mod_card_icon" src="${escapeHtml(iconSrc)}" onerror="this.src='./assets/images/SealCircle.png'" alt="${safeTitle}"/>
                        <div class="rz_mod_card_meta">
                            <div class="rz_mod_card_title" title="${safeTitle}">${safeTitle}</div>
                            <div class="rz_mod_card_author">by ${safeAuthor}</div>
                            <div class="rz_mod_card_stats">
                                <span title="總下載次數">📥 ${formatCount(hit.downloads)}</span>
                                <span title="關注人數">❤️ ${formatCount(hit.follows)}</span>
                            </div>
                        </div>
                    </div>

                    <div class="rz_mod_card_desc rz_clickable_card_header" data-id="${safeId}" data-title="${safeTitle}" title="${safeDesc}">
                        ${safeDesc}
                    </div>

                    <div class="rz_mod_card_cats">
                        <span class="rz_card_cat_pill rz_pill_fabric">Fabric</span>
                        ${cats}
                    </div>

                    <div class="rz_mod_card_bottom">
                        <div class="rz_card_actions" id="actions_${safeId}">
                            ${hit.isInstalled ? `
                                <span class="rz_installed_badge" title="版本: ${escapeHtml(hit.installedVersionNumber || '已安裝')}">✓ 已安裝</span>
                                <button type="button" class="rz_card_versions_btn" data-id="${safeId}" data-title="${safeTitle}" title="選擇或切換其他版本">📋 換版本</button>
                                <button type="button" class="rz_card_uninstall_btn" data-id="${safeId}" data-title="${safeTitle}">🗑️ 移除</button>
                            ` : `
                                <button type="button" class="rz_card_install_btn" data-id="${safeId}" data-title="${safeTitle}" title="一鍵自動安裝 1.21.11 最新相容版">⚡ 推薦安裝</button>
                                <button type="button" class="rz_card_versions_btn" data-id="${safeId}" data-title="${safeTitle}" title="自由選擇歷史或特定版本">📋 選擇版本</button>
                            `}
                        </div>
                    </div>
                </div>
            `
        }

        if (append && grid) {
            grid.insertAdjacentHTML('beforeend', cardsHtml)
        } else if (grid) {
            grid.innerHTML = cardsHtml
        }

        // Load more button visibility
        if (loadMoreBtn) {
            if (marketState.category !== 'installed' && marketState.offset + marketState.limit < marketState.total) {
                loadMoreBtn.style.display = 'block'
                loadMoreBtn.innerText = `載入更多模組 (${marketState.offset + marketState.limit} / ${marketState.total})...`
            } else {
                loadMoreBtn.style.display = 'none'
            }
        }

        updateInstalledCountBadge()
    }

    /**
     * Fetch and load mods from Modrinth
     */
    async function loadMarketMods(append = false) {
        if (marketState.loading) return
        marketState.loading = true

        console.log(`[ModMarketUI] loadMarketMods: category=${marketState.category}, query=${marketState.query}, offset=${marketState.offset}`)

        const loadingBox = document.getElementById('rz_market_loading')
        const errorBox = document.getElementById('rz_market_error')
        const emptyBox = document.getElementById('rz_market_empty')

        if (!append) {
            if (loadingBox) loadingBox.style.display = 'flex'
            if (errorBox) errorBox.style.display = 'none'
            if (emptyBox) emptyBox.style.display = 'none'
        }

        try {
            const result = await ModMarket.searchMods({
                query: marketState.query,
                category: marketState.category,
                index: marketState.sort,
                limit: marketState.limit,
                offset: marketState.offset
            })

            marketState.total = result.total_hits || 0
            if (append) {
                marketState.hits.push(...(result.hits || []))
            } else {
                marketState.hits = result.hits || []
            }

            console.log(`[ModMarketUI] Received ${result.hits ? result.hits.length : 0} mods, total: ${marketState.total}`)
            renderMarketGrid(append)
        } catch (err) {
            console.error('[ModMarketUI] Failed to load mods from market:', err)
            if (!append && errorBox) {
                errorBox.style.display = 'flex'
                const msgEl = document.getElementById('rz_market_error_msg')
                if (msgEl) msgEl.innerText = err.message || '連線至 Modrinth 伺服器超時，請檢查網路。'
            }
            showMarketToast('載入模組清單失敗：' + err.message, true)
        } finally {
            marketState.loading = false
            if (loadingBox) loadingBox.style.display = 'none'
        }
    }

    /**
     * Handle fast recommended mod installation (auto-picks best 1.21.11 version)
     */
    async function rzHandleInstallMod(projectId, title) {
        const safeId = escapeHtml(projectId)
        const actionsBox = document.getElementById(`actions_${safeId}`)
        if (!actionsBox) return

        console.log(`[ModMarketUI] Quick installing recommended mod: ${title} (${projectId})`)

        actionsBox.innerHTML = `
            <div class="rz_install_progress_wrap">
                <div class="rz_install_progress_bar" id="pbar_${safeId}" style="width: 15%;"></div>
                <span class="rz_install_progress_text" id="ptext_${safeId}">下載中 15%</span>
            </div>
        `

        try {
            const res = await ModMarket.installMod(projectId, (percent) => {
                const pbar = document.getElementById(`pbar_${safeId}`)
                const ptext = document.getElementById(`ptext_${safeId}`)
                if (pbar && ptext) {
                    pbar.style.width = `${Math.max(percent, 10)}%`
                    ptext.innerText = `下載中 ${percent}%`
                }
            })

            // Success state
            actionsBox.innerHTML = `
                <span class="rz_installed_badge" title="版本: ${escapeHtml(res.versionNumber || '已安裝')}">✓ 已安裝</span>
                <button type="button" class="rz_card_versions_btn" data-id="${safeId}" data-title="${escapeHtml(title)}">📋 換版本</button>
                <button type="button" class="rz_card_uninstall_btn" data-id="${safeId}" data-title="${escapeHtml(title)}">🗑️ 移除</button>
            `
            const card = document.getElementById(`mod_card_${safeId}`)
            if (card) card.classList.add('rz_card_installed')

            // Update hit state
            const hit = marketState.hits.find(h => h.id === projectId)
            if (hit) {
                hit.isInstalled = true
                hit.installedVersionNumber = res.versionNumber
            }

            updateInstalledCountBadge()
            showMarketToast(`🎉 成功安裝模組：${title} (${res.versionNumber || ''})！`)

            if (typeof reloadDropinMods === 'function') {
                try { await reloadDropinMods() } catch (_e) { /* Best effort refresh. */ }
            }
        } catch (err) {
            console.error(`[ModMarketUI] Failed to install mod ${projectId}:`, err)
            actionsBox.innerHTML = `
                <button type="button" class="rz_card_install_btn" data-id="${safeId}" data-title="${escapeHtml(title)}">重試安裝</button>
                <button type="button" class="rz_card_versions_btn" data-id="${safeId}" data-title="${escapeHtml(title)}">📋 選擇版本</button>
            `
            showMarketToast(`安裝失敗：${err.message}`, true)
        }
    }

    /**
     * Handle installing a SPECIFIC version from the version modal
     */
    async function rzHandleInstallSpecificVersion(projectId, versionId, title, versionNumber) {
        const safeVerId = escapeHtml(versionId)
        const btn = document.getElementById(`ver_btn_${safeVerId}`)
        if (btn) {
            btn.disabled = true
            btn.innerText = '準備下載...'
        }

        console.log(`[ModMarketUI] Installing specific version: ${title} - ${versionNumber} (${versionId})`)

        try {
            const res = await ModMarket.installModVersion(projectId, versionId, (percent) => {
                if (btn) {
                    btn.innerText = `下載中 ${percent}%`
                }
            })

            showMarketToast(`🎉 成功安裝版本：${title} (${versionNumber})！`)

            // Refresh modal versions state
            if (modalState.projectId === projectId) {
                modalState.versions.forEach(v => {
                    v.isInstalled = (v.id === versionId)
                })
                renderVersionList()
                const installedBadge = document.getElementById('rz_modal_installed_badge')
                if (installedBadge) installedBadge.style.display = 'inline-block'
            }

            // Refresh main card if visible
            const card = document.getElementById(`mod_card_${projectId}`)
            if (card) {
                card.classList.add('rz_card_installed')
                const actionsBox = document.getElementById(`actions_${projectId}`)
                if (actionsBox) {
                    actionsBox.innerHTML = `
                        <span class="rz_installed_badge" title="版本: ${escapeHtml(versionNumber)}">✓ 已安裝</span>
                        <button type="button" class="rz_card_versions_btn" data-id="${escapeHtml(projectId)}" data-title="${escapeHtml(title)}">📋 換版本</button>
                        <button type="button" class="rz_card_uninstall_btn" data-id="${escapeHtml(projectId)}" data-title="${escapeHtml(title)}">🗑️ 移除</button>
                    `
                }
            }

            const hit = marketState.hits.find(h => h.id === projectId)
            if (hit) {
                hit.isInstalled = true
                hit.installedVersionNumber = versionNumber
            }

            updateInstalledCountBadge()

            if (typeof reloadDropinMods === 'function') {
                try { await reloadDropinMods() } catch (_e) { /* Best effort refresh. */ }
            }
        } catch (err) {
            console.error(`[ModMarketUI] Failed to install specific version ${versionId}:`, err)
            if (btn) {
                btn.disabled = false
                btn.innerText = '重試安裝'
            }
            showMarketToast(`版本安裝失敗：${err.message}`, true)
        }
    }

    /**
     * Handle mod uninstallation
     */
    async function rzHandleUninstallMod(projectId, title) {
        const safeId = escapeHtml(projectId)
        const actionsBox = document.getElementById(`actions_${safeId}`)
        if (actionsBox) {
            actionsBox.innerHTML = '<span style="font-size: 11.5px; color: #94a3b8;">正在移除...</span>'
        }

        console.log(`[ModMarketUI] Uninstalling mod: ${title} (${projectId})`)

        try {
            await ModMarket.uninstallMod(projectId)

            if (actionsBox) {
                actionsBox.innerHTML = `
                    <button type="button" class="rz_card_install_btn" data-id="${safeId}" data-title="${escapeHtml(title)}">⚡ 推薦安裝</button>
                    <button type="button" class="rz_card_versions_btn" data-id="${safeId}" data-title="${escapeHtml(title)}">📋 選擇版本</button>
                `
            }
            const card = document.getElementById(`mod_card_${safeId}`)
            if (card) card.classList.remove('rz_card_installed')

            // Update modal state if open
            if (modalState.projectId === projectId) {
                modalState.versions.forEach(v => { v.isInstalled = false })
                renderVersionList()
                const installedBadge = document.getElementById('rz_modal_installed_badge')
                if (installedBadge) installedBadge.style.display = 'none'
            }

            // Update hit state
            const hit = marketState.hits.find(h => h.id === projectId)
            if (hit) {
                hit.isInstalled = false
                hit.installedVersionNumber = null
            }

            updateInstalledCountBadge()
            showMarketToast(`🗑️ 已移除模組：${title}`)

            if (marketState.category === 'installed') {
                marketState.offset = 0
                loadMarketMods(false)
            }

            if (typeof reloadDropinMods === 'function') {
                try { await reloadDropinMods() } catch (_e) { /* Best effort refresh. */ }
            }
        } catch (err) {
            console.error(`[ModMarketUI] Failed to uninstall mod ${projectId}:`, err)
            if (actionsBox) {
                actionsBox.innerHTML = `
                    <span class="rz_installed_badge">✓ 已安裝</span>
                    <button type="button" class="rz_card_uninstall_btn" data-id="${safeId}" data-title="${escapeHtml(title)}">🗑️ 移除</button>
                `
            }
            showMarketToast(`移除失敗：${err.message}`, true)
        }
    }

    /**
     * Open XMCL-style Mod Versions & Details Modal
     */
    async function openModVersionsModal(projectId, modTitle) {
        const modal = document.getElementById('rz_mod_details_modal')
        if (!modal) return

        modalState.projectId = projectId
        modalState.title = modTitle
        modalState.loading = true
        modalState.versions = []

        // Set initial header info
        const titleEl = document.getElementById('rz_modal_title')
        const authorEl = document.getElementById('rz_modal_author')
        const iconEl = document.getElementById('rz_modal_icon')
        const descEl = document.getElementById('rz_modal_desc')
        const statsEl = document.getElementById('rz_modal_stats')
        const installedBadge = document.getElementById('rz_modal_installed_badge')

        if (titleEl) titleEl.innerText = modTitle || '模組版本與詳情'
        if (authorEl) authorEl.innerText = '讀取中...'
        if (descEl) descEl.innerText = '正在從 Modrinth 獲取模組資料與版本清單...'
        if (statsEl) statsEl.innerText = ''
        if (iconEl) iconEl.src = './assets/images/SealCircle.png'

        // Check if currently installed
        const db = ModMarket.loadInstalledDb()
        const isInst = !!db[projectId]
        if (installedBadge) {
            installedBadge.style.display = isInst ? 'inline-block' : 'none'
            if (isInst && db[projectId].versionNumber) {
                installedBadge.innerText = `✓ 已安裝 (${db[projectId].versionNumber})`
            } else {
                installedBadge.innerText = '✓ 已安裝'
            }
        }

        // Reset external links
        const linkModrinth = document.getElementById('rz_modal_link_modrinth')
        const linkSource = document.getElementById('rz_modal_link_source')
        const linkIssues = document.getElementById('rz_modal_link_issues')
        if (linkModrinth) linkModrinth.style.display = 'none'
        if (linkSource) linkSource.style.display = 'none'
        if (linkIssues) linkIssues.style.display = 'none'

        // Show modal
        modal.style.display = 'flex'

        // Show loading state for versions
        const versionLoading = document.getElementById('rz_version_loading')
        const versionError = document.getElementById('rz_version_error')
        const versionEmpty = document.getElementById('rz_version_empty')
        const versionList = document.getElementById('rz_version_list')

        if (versionLoading) versionLoading.style.display = 'flex'
        if (versionError) versionError.style.display = 'none'
        if (versionEmpty) versionEmpty.style.display = 'none'
        if (versionList) versionList.innerHTML = ''

        try {
            // Load both project details and versions in parallel
            const [details, versions] = await Promise.all([
                ModMarket.getProjectDetails(projectId).catch(e => { console.warn('Failed details:', e); return null }),
                ModMarket.getProjectVersions(projectId)
            ])

            modalState.details = details
            modalState.versions = versions || []

            // Populate project details
            if (details) {
                if (titleEl) titleEl.innerText = details.title || modTitle
                if (authorEl) authorEl.innerText = `by ${details.author || '社群開發者'}`
                if (descEl) descEl.innerText = details.description || '尚無詳細說明。'
                if (statsEl) statsEl.innerText = `📥 ${formatCount(details.downloads)} 下載 ‧ ❤️ ${formatCount(details.followers || details.follows)} 關注`
                if (iconEl && details.icon_url) iconEl.src = details.icon_url

                // Categories
                const catsEl = document.getElementById('rz_modal_categories')
                if (catsEl && details.categories) {
                    catsEl.innerHTML = details.categories.slice(0, 4).map(c => `<span class="rz_card_cat_pill">${escapeHtml(c)}</span>`).join('')
                }

                // External links
                if (linkModrinth) {
                    linkModrinth.style.display = 'inline-block'
                    linkModrinth.onclick = () => shell.openExternal(`https://modrinth.com/mod/${details.slug || projectId}`)
                }
                if (linkSource && details.source_url) {
                    linkSource.style.display = 'inline-block'
                    linkSource.onclick = () => shell.openExternal(details.source_url)
                }
                if (linkIssues && details.issues_url) {
                    linkIssues.style.display = 'inline-block'
                    linkIssues.onclick = () => shell.openExternal(details.issues_url)
                }
            }

            renderVersionList()
        } catch (err) {
            console.error('[ModMarketUI] Failed to load project versions:', err)
            if (versionError) {
                versionError.style.display = 'flex'
                const msg = document.getElementById('rz_version_error_msg')
                if (msg) msg.innerText = `讀取版本清單失敗: ${err.message}`
            }
        } finally {
            modalState.loading = false
            if (versionLoading) versionLoading.style.display = 'none'
        }
    }

    /**
     * Render the filtered version list inside the XMCL version modal
     */
    function renderVersionList() {
        const versionList = document.getElementById('rz_version_list')
        const versionEmpty = document.getElementById('rz_version_empty')
        if (!versionList) return

        versionList.innerHTML = ''

        // Filter versions based on modalState.verFilter and modalState.channelFilter
        let filtered = modalState.versions || []

        // 1. Game version filter
        if (modalState.verFilter === '12111') {
            const exact12111 = filtered.filter(v => v.isExact12111)
            // If none exact 1.21.11 found, fall back to any 1.21.x so list is never confusingly empty
            filtered = exact12111.length > 0 ? exact12111 : filtered.filter(v => v.isCompatible121)
        } else if (modalState.verFilter === '121x') {
            filtered = filtered.filter(v => v.isCompatible121)
        }

        // 2. Channel filter
        if (modalState.channelFilter === 'release') {
            filtered = filtered.filter(v => v.versionType === 'release')
        } else if (modalState.channelFilter === 'beta') {
            filtered = filtered.filter(v => v.versionType !== 'release')
        }

        if (filtered.length === 0) {
            if (versionEmpty) versionEmpty.style.display = 'flex'
            return
        } else {
            if (versionEmpty) versionEmpty.style.display = 'none'
        }

        const anyInstalled = modalState.versions.some(v => v.isInstalled)

        let listHtml = ''

        for (const ver of filtered) {
            const safeVerId = escapeHtml(ver.id)
            const safeVerNum = escapeHtml(ver.versionNumber)
            const safeProjId = escapeHtml(modalState.projectId)
            const safeTitle = escapeHtml(modalState.title || '')
            const dateStr = formatDate(ver.datePublished)
            const fileSize = ver.primaryFile ? formatBytes(ver.primaryFile.size) : '未知大小'
            const channelBadgeClass = ver.versionType === 'release' ? 'rz_badge_release' : (ver.versionType === 'beta' ? 'rz_badge_beta' : 'rz_badge_alpha')
            const channelBadgeText = ver.versionType ? ver.versionType.toUpperCase() : 'RELEASE'

            // Compatible game versions tags
            const gvTags = (ver.gameVersions || []).map(gv => {
                const isExact = (gv === '1.21.11')
                return `<span class="rz_mc_ver_tag ${isExact ? 'rz_mc_ver_exact' : ''}" title="${isExact ? '★ 核心完全相容 1.21.11' : ''}">${escapeHtml(gv)}</span>`
            }).join('')

            // Action button
            let actionBtnHtml = ''
            if (ver.isInstalled) {
                actionBtnHtml = `
                    <span class="rz_ver_installed_tag">✓ 目前使用中</span>
                    <button type="button" class="rz_ver_action_btn rz_ver_changelog_btn" data-action="uninstall" data-id="${safeProjId}" data-title="${safeTitle}">🗑️ 移除</button>
                `
            } else if (anyInstalled) {
                actionBtnHtml = `
                    <button type="button" class="rz_ver_action_btn rz_ver_switch_btn" id="ver_btn_${safeVerId}" data-action="install-ver" data-id="${safeProjId}" data-ver-id="${safeVerId}" data-ver-num="${safeVerNum}" data-title="${safeTitle}" title="自動替換目前版本為此版本">🔄 切換至此版本</button>
                `
            } else {
                actionBtnHtml = `
                    <button type="button" class="rz_ver_action_btn rz_ver_install_btn" id="ver_btn_${safeVerId}" data-action="install-ver" data-id="${safeProjId}" data-ver-id="${safeVerId}" data-ver-num="${safeVerNum}" data-title="${safeTitle}">📥 安裝此版本</button>
                `
            }

            const hasChangelog = !!(ver.changelog && ver.changelog.trim())

            listHtml += `
                <div class="rz_ver_card ${ver.isInstalled ? 'rz_ver_card_installed' : ''}" id="ver_card_${safeVerId}">
                    <div class="rz_ver_row_main">
                        <div class="rz_ver_meta_left">
                            <div class="rz_ver_title_line">
                                <span class="rz_ver_number" title="${safeVerNum}">${safeVerNum}</span>
                                <span class="rz_channel_badge ${channelBadgeClass}">${channelBadgeText}</span>
                                ${ver.isExact12111 ? '<span class="rz_channel_badge rz_badge_release" style="border-color:#38bdf8; color:#38bdf8; background:rgba(56,189,248,0.2);">★ 1.21.11 推薦</span>' : ''}
                            </div>
                            <div class="rz_ver_details_line">
                                <span>📅 ${dateStr}</span>
                                <span>‧</span>
                                <span>💾 ${fileSize}</span>
                                <span>‧</span>
                                <span>📥 ${formatCount(ver.downloads)}</span>
                                <span>‧</span>
                                <div style="display:inline-flex; gap:4px; align-items:center;">
                                    ${gvTags}
                                </div>
                            </div>
                        </div>

                        <div class="rz_ver_meta_right">
                            ${hasChangelog ? `
                                <button type="button" class="rz_ver_changelog_btn" data-action="toggle-changelog" data-ver-id="${safeVerId}">📝 更新日誌 ▼</button>
                            ` : ''}
                            ${actionBtnHtml}
                        </div>
                    </div>

                    ${hasChangelog ? `
                        <div class="rz_ver_changelog_box" id="changelog_${safeVerId}" style="display: none;">
                            ${escapeHtml(ver.changelog)}
                        </div>
                    ` : ''}
                </div>
            `
        }

        versionList.innerHTML = listHtml
    }

    /**
     * Close the version modal
     */
    function closeModVersionsModal() {
        const modal = document.getElementById('rz_mod_details_modal')
        if (modal) {
            modal.style.display = 'none'
        }
        modalState.projectId = null
        modalState.versions = []
        modalState.details = null
    }

    /**
     * Helper to refresh market when user opens it
     */
    window.rzRefreshMarketOnOpen = function() {
        console.log('[ModMarketUI] rzRefreshMarketOnOpen triggered')
        updateInstalledCountBadge()
        if (!marketState.hits || marketState.hits.length === 0) {
            loadMarketMods(false)
        }
    }

    /**
     * Initialize Mod Market events
     */
    function initModMarket() {
        if (marketInitialized) return
        marketInitialized = true

        console.log('[ModMarketUI] Binding Mod Market DOM event listeners...')

        // Back button
        const backBtn = document.getElementById('rz_market_back_btn')
        if (backBtn) {
            backBtn.onclick = () => {
                console.log('[ModMarketUI] Back button clicked!')
                switchView(getCurrentView(), VIEWS.landing, 400, 400)
            }
        }

        // Search input
        const searchInput = document.getElementById('rz_market_search_input')
        const searchClear = document.getElementById('rz_market_search_clear')

        if (searchInput) {
            searchInput.oninput = (e) => {
                const val = e.target.value
                marketState.query = val
                marketState.offset = 0

                if (searchClear) {
                    searchClear.style.display = val ? 'block' : 'none'
                }

                clearTimeout(searchDebounceTimer)
                searchDebounceTimer = setTimeout(() => {
                    loadMarketMods(false)
                }, 350)
            }
        }

        if (searchClear) {
            searchClear.onclick = () => {
                if (searchInput) {
                    searchInput.value = ''
                    marketState.query = ''
                    searchClear.style.display = 'none'
                    marketState.offset = 0
                    loadMarketMods(false)
                }
            }
        }

        // Sort select
        const sortSelect = document.getElementById('rz_market_sort_select')
        if (sortSelect) {
            sortSelect.onchange = (e) => {
                marketState.sort = e.target.value
                marketState.offset = 0
                loadMarketMods(false)
            }
        }

        // Refresh button
        const refreshBtn = document.getElementById('rz_market_refresh_btn')
        if (refreshBtn) {
            refreshBtn.onclick = () => {
                marketState.offset = 0
                loadMarketMods(false)
                showMarketToast('🔄 已重新整理模組庫清單')
            }
        }

        // Open mods folder button
        const openFolderBtn = document.getElementById('rz_market_open_folder_btn')
        if (openFolderBtn) {
            openFolderBtn.onclick = () => {
                const dir = ModMarket.getActiveModsDirectory()
                if (dir) {
                    shell.openPath(dir)
                }
            }
        }

        // Category chips
        const chips = document.querySelectorAll('.rz_market_cat_chip')
        chips.forEach(chip => {
            chip.onclick = () => {
                chips.forEach(c => c.classList.remove('rz_cat_active'))
                chip.classList.add('rz_cat_active')

                const cat = chip.getAttribute('data-cat')
                console.log('[ModMarketUI] Selected category:', cat)
                marketState.category = cat
                marketState.offset = 0
                loadMarketMods(false)
            }
        })

        // Load more button
        const loadMoreBtn = document.getElementById('rz_market_load_more_btn')
        if (loadMoreBtn) {
            loadMoreBtn.onclick = () => {
                marketState.offset += marketState.limit
                loadMarketMods(true)
            }
        }

        // Retry button on error
        const retryBtn = document.getElementById('rz_market_retry_btn')
        if (retryBtn) {
            retryBtn.onclick = () => {
                marketState.offset = 0
                loadMarketMods(false)
            }
        }

        // Event delegation on main mod grid
        const grid = document.getElementById('rz_market_grid')
        if (grid) {
            grid.addEventListener('click', (e) => {
                // 1. One-click recommended install button
                const installBtn = e.target.closest('.rz_card_install_btn')
                if (installBtn) {
                    const id = installBtn.getAttribute('data-id')
                    const title = installBtn.getAttribute('data-title')
                    if (id) rzHandleInstallMod(id, title || id)
                    return
                }

                // 2. Open version selection modal button ("📋 選擇版本" / "📋 換版本")
                const versionsBtn = e.target.closest('.rz_card_versions_btn')
                if (versionsBtn) {
                    const id = versionsBtn.getAttribute('data-id')
                    const title = versionsBtn.getAttribute('data-title')
                    if (id) openModVersionsModal(id, title || id)
                    return
                }

                // 3. Uninstall button
                const uninstallBtn = e.target.closest('.rz_card_uninstall_btn')
                if (uninstallBtn) {
                    const id = uninstallBtn.getAttribute('data-id')
                    const title = uninstallBtn.getAttribute('data-title')
                    if (id) rzHandleUninstallMod(id, title || id)
                    return
                }

                // 4. Clicking card header / title / thumbnail opens the version modal
                const cardHeader = e.target.closest('.rz_clickable_card_header')
                if (cardHeader) {
                    const id = cardHeader.getAttribute('data-id')
                    const title = cardHeader.getAttribute('data-title')
                    if (id) openModVersionsModal(id, title || id)
                    return
                }
            })
        }

        // -------------------------------------------------------------
        // XMCL Version Modal Event Bindings
        // -------------------------------------------------------------

        // Close button
        const modalCloseBtn = document.getElementById('rz_modal_close_btn')
        if (modalCloseBtn) {
            modalCloseBtn.onclick = closeModVersionsModal
        }

        // Click outside dialog to close
        const modalOverlay = document.getElementById('rz_mod_details_modal')
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) {
                    closeModVersionsModal()
                }
            })
        }

        // ESC key to close modal
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('rz_mod_details_modal')
                if (modal && modal.style.display !== 'none') {
                    closeModVersionsModal()
                }
            }
        })

        // Game version filter buttons
        const verFilterBtns = document.querySelectorAll('.rz_ver_filter_btn')
        verFilterBtns.forEach(btn => {
            btn.onclick = () => {
                verFilterBtns.forEach(b => b.classList.remove('rz_ver_filter_active'))
                btn.classList.add('rz_ver_filter_active')
                modalState.verFilter = btn.getAttribute('data-ver-filter')
                renderVersionList()
            }
        })

        // Release channel filter buttons
        const channelFilterBtns = document.querySelectorAll('.rz_channel_filter_btn')
        channelFilterBtns.forEach(btn => {
            btn.onclick = () => {
                channelFilterBtns.forEach(b => b.classList.remove('rz_channel_active'))
                btn.classList.add('rz_channel_active')
                modalState.channelFilter = btn.getAttribute('data-channel')
                renderVersionList()
            }
        })

        // Event delegation on version list
        const versionList = document.getElementById('rz_version_list')
        if (versionList) {
            versionList.addEventListener('click', (e) => {
                // 1. Install specific version or switch version
                const installVerBtn = e.target.closest('[data-action="install-ver"]')
                if (installVerBtn) {
                    const projectId = installVerBtn.getAttribute('data-id')
                    const versionId = installVerBtn.getAttribute('data-ver-id')
                    const versionNumber = installVerBtn.getAttribute('data-ver-num')
                    const title = installVerBtn.getAttribute('data-title')
                    if (projectId && versionId) {
                        rzHandleInstallSpecificVersion(projectId, versionId, title || projectId, versionNumber || versionId)
                    }
                    return
                }

                // 2. Uninstall from modal
                const uninstallVerBtn = e.target.closest('[data-action="uninstall"]')
                if (uninstallVerBtn) {
                    const projectId = uninstallVerBtn.getAttribute('data-id')
                    const title = uninstallVerBtn.getAttribute('data-title')
                    if (projectId) {
                        rzHandleUninstallMod(projectId, title || projectId)
                    }
                    return
                }

                // 3. Toggle changelog accordion
                const changelogBtn = e.target.closest('[data-action="toggle-changelog"]')
                if (changelogBtn) {
                    const verId = changelogBtn.getAttribute('data-ver-id')
                    const box = document.getElementById(`changelog_${verId}`)
                    if (box) {
                        const isHidden = (box.style.display === 'none')
                        box.style.display = isHidden ? 'block' : 'none'
                        changelogBtn.innerText = isHidden ? '📝 收起日誌 ▲' : '📝 更新日誌 ▼'
                    }
                    return
                }
            })
        }

        console.log('[ModMarketUI] Initial load of market mods starting...')
        // Initial load
        loadMarketMods(false)
    }

    // Attach initial trigger
    document.addEventListener('DOMContentLoaded', () => {
        initModMarket()
    })

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initModMarket()
    }
})()
