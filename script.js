document.addEventListener('DOMContentLoaded', () => {
    // =====================================================================================
    // グローバル変数 & 定数
    // =====================================================================================
    let db;
    const dbName = "BaseballScoreDB";
    const playerStoreName = "playerMaster";
    const gameDataStoreName = "gameData";

    let homePlayers = [];
    let awayPlayers = [];
    let gameData = {};

    let currentSubstitutionData = null;
    let currentEditPlayerData = null;
    let currentEditingAtBatId = null;
    let currentEditingMasterPlayer = null;

    // =====================================================================================
    // 初期化
    // =====================================================================================
    initializeApp();

    async function initializeApp() {
        try {
            await initDB();
            resetGameData(); // まずデフォルト値を設定
            await loadGameData(); // DBから保存データを読み込んで上書き
            setupEventListeners();
            updateAllDisplays();
            console.log("Baseball Score App Initialized Successfully");
        } catch (error) {
            console.error("Initialization failed:", error);
            showMessage('アプリケーションの初期化に失敗しました。', 'error');
        }
    }

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 4);
            request.onerror = (event) => reject(`Database error: ${event.target.errorCode}`);
            request.onsuccess = (event) => {
                db = event.target.result;
                resolve();
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(playerStoreName)) {
                    const store = db.createObjectStore(playerStoreName, { keyPath: ['teamName', 'number'] });
                    store.createIndex('teamName', 'teamName', { unique: false });
                }
                if (!db.objectStoreNames.contains(gameDataStoreName)) {
                    db.createObjectStore(gameDataStoreName, { keyPath: "id" });
                }
            };
        });
    }

    function setupEventListeners() {
        // ボタン
        document.getElementById('helpButton').addEventListener('click', () => openModal('helpModal'));
        document.getElementById('downloadPdfButton').addEventListener('click', downloadGamePDF);
        document.getElementById('resetGameButton').addEventListener('click', resetGame);
        document.getElementById('addPlayerButton').addEventListener('click', addPlayer);
        document.getElementById('openPlayerMasterModalButton').addEventListener('click', openPlayerMasterModal);
        document.getElementById('addSampleHomePlayersButton').addEventListener('click', () => addSamplePlayers('home'));
        document.getElementById('addSampleAwayPlayersButton').addEventListener('click', () => addSamplePlayers('away'));
        document.getElementById('addOutButton').addEventListener('click', addOut);
        document.getElementById('resetOutsButton').addEventListener('click', resetOuts);
        document.getElementById('recordAtBatButton').addEventListener('click', recordAtBat);
        document.getElementById('clearHistoryButton').addEventListener('click', clearHistory);

        // ベース
        document.getElementById('base1').addEventListener('click', () => toggleBase(0));
        document.getElementById('base2').addEventListener('click', () => toggleBase(1));
        document.getElementById('base3').addEventListener('click', () => toggleBase(2));

        // 入力・選択
        document.getElementById('homeTeamName').addEventListener('input', () => { gameData.homeTeamName = document.getElementById('homeTeamName').value; saveAndRefresh(); });
        document.getElementById('awayTeamName').addEventListener('input', () => { gameData.awayTeamName = document.getElementById('awayTeamName').value; saveAndRefresh(); });
        document.getElementById('gameDate').addEventListener('change', saveGameInfo);
        document.getElementById('gameLocation').addEventListener('change', saveGameInfo);
        document.getElementById('gameStatus').addEventListener('change', saveGameInfo);
        document.getElementById('gameResult').addEventListener('change', saveGameInfo);
        document.getElementById('currentInning').addEventListener('change', () => { gameData.currentInning = parseInt(document.getElementById('currentInning').value); saveAndRefresh(); });
        document.getElementById('topBottom').addEventListener('change', () => { gameData.isTop = document.getElementById('topBottom').value === 'top'; saveAndRefresh(); });
        document.getElementById('battingTeam').addEventListener('change', updateBatterSelect);

        // モーダル閉じるボタン
        document.querySelectorAll('.modal .close, .modal .cancel-button').forEach(el => {
            const modal = el.closest('.modal');
            if (modal) {
                el.addEventListener('click', () => closeModal(modal.id));
            }
        });
        document.getElementById('cancelHelpModalButton').addEventListener('click', () => closeModal('helpModal'));
        document.getElementById('cancelSubstitutionButton').addEventListener('click', () => closeModal('substitutionModal'));
        document.getElementById('cancelEditPlayerButton').addEventListener('click', () => closeModal('editPlayerModal'));
        document.getElementById('cancelEditAtBatButton').addEventListener('click', () => closeModal('editAtBatModal'));
        document.getElementById('cancelPlayerMasterModalButton').addEventListener('click', () => closeModal('playerMasterModal'));
        document.getElementById('cancelEditPlayerMasterButton').addEventListener('click', () => closeModal('editPlayerMasterModal'));

        // モーダルアクションボタン
        document.getElementById('confirmSubstitutionButton').addEventListener('click', confirmSubstitution);
        document.getElementById('confirmEditPlayerButton').addEventListener('click', confirmEditPlayer);
        document.getElementById('deletePlayerButton').addEventListener('click', deletePlayer);
        document.getElementById('confirmEditAtBatButton').addEventListener('click', confirmEditAtBat);
        document.getElementById('confirmEditPlayerMasterButton').addEventListener('click', confirmEditPlayerMaster);
        document.getElementById('deletePlayerFromMasterButton').addEventListener('click', deletePlayerFromMaster);
        
        // スコアボードの直接編集
        makeScoreEditable();

        // アコーディオン機能
        document.querySelectorAll('.section-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => {
                const content = toggle.nextElementSibling;
                toggle.classList.toggle('collapsed');
                // content.style.display = toggle.classList.contains('collapsed') ? 'none' : '';
                if (toggle.classList.contains('collapsed')) {
                    content.style.maxHeight = null;
                } else {
                    content.style.maxHeight = content.scrollHeight + "px";
                }
            });
        });
    }

    // =====================================================================================
    // データ管理
    // =====================================================================================
    function resetGameData() {
        homePlayers = [];
        awayPlayers = [];
        gameData = {
            id: "current_game",
            date: new Date().toISOString().split('T')[0],
            location: '',
            homeTeamName: '後攻チーム',
            awayTeamName: '先攻チーム',
            status: 'ongoing',
            result: '',
            homeScore: Array(7).fill(0),
            awayScore: Array(7).fill(0),
            currentInning: 1,
            isTop: true,
            outs: 0,
            bases: [false, false, false],
            atBatHistory: [],
            substitutionHistory: []
        };
    }

    function saveGameData() {
        if (!db) return;
        const transaction = db.transaction([gameDataStoreName], "readwrite");
        const store = transaction.objectStore(gameDataStoreName);
        store.put({ ...gameData, homePlayers, awayPlayers });
    }

    function loadGameData() {
        return new Promise((resolve) => {
            if (!db) return resolve();
            const request = db.transaction([gameDataStoreName], "readonly").objectStore(gameDataStoreName).get("current_game");
            request.onsuccess = (event) => {
                if (event.target.result) {
                    const loaded = event.target.result;
                    gameData = { ...gameData, ...loaded };
                    homePlayers = loaded.homePlayers || [];
                    awayPlayers = loaded.awayPlayers || [];
                    showMessage('前回の試合データをロードしました', 'success');
                }
                resolve();
            };
            request.onerror = () => resolve(); // ロード失敗時もアプリは継続
        });
    }

    function resetGame() {
        if (confirm('現在の試合データをすべてリセットしますか？この操作は元に戻せません。')) {
            resetGameData();
            if (db) {
                const transaction = db.transaction([gameDataStoreName], "readwrite");
                transaction.objectStore(gameDataStoreName).delete("current_game");
            }
            saveAndRefresh();
            showMessage('試合データをリセットしました', 'success');
        }
    }

    function saveGameInfo() {
        gameData.date = document.getElementById('gameDate').value;
        gameData.location = document.getElementById('gameLocation').value;
        gameData.status = document.getElementById('gameStatus').value;
        gameData.result = document.getElementById('gameResult').value;
        saveGameData();
    }

    // =====================================================================================
    // UI更新
    // =====================================================================================
    function updateAllDisplays() {
        updateTeamNames();
        updatePlayersDisplay();
        updateScoreboard();
        updateGameStatus();
        updateBatterSelect();
        updateAtBatHistory();
        updatePlayerStatsDisplay();
        updateSubstitutionHistory();
        updateGameResultOptions();
        document.getElementById('gameDate').value = gameData.date;
        document.getElementById('gameLocation').value = gameData.location;
        document.getElementById('gameStatus').value = gameData.status;
        document.getElementById('gameResult').value = gameData.result;
    }

    function saveAndRefresh() {
        saveGameData();
        updateAllDisplays();
    }

    function updateTeamNames() {
        document.getElementById('homeTeamName').value = gameData.homeTeamName;
        document.getElementById('awayTeamName').value = gameData.awayTeamName;
        document.getElementById('homeTeamNameDisplay').textContent = gameData.homeTeamName;
        document.getElementById('awayTeamNameDisplay').textContent = gameData.awayTeamName;
        document.getElementById('homeTeamPlayersTitle').textContent = `${gameData.homeTeamName} 選手`;
        document.getElementById('awayTeamPlayersTitle').textContent = `${gameData.awayTeamName} 選手`;
        document.getElementById('playerTeam').options[0].textContent = gameData.awayTeamName;
        document.getElementById('playerTeam').options[1].textContent = gameData.homeTeamName;
        document.getElementById('battingTeam').options[0].textContent = gameData.awayTeamName;
        document.getElementById('battingTeam').options[1].textContent = gameData.homeTeamName;
    }

    function updateGameResultOptions() {
        const select = document.getElementById('gameResult');
        select.options[1].textContent = `${gameData.homeTeamName}勝利`;
        select.options[2].textContent = `${gameData.awayTeamName}勝利`;
    }

    function updatePlayersDisplay() {
        const homeList = document.getElementById('homePlayersList');
        const awayList = document.getElementById('awayPlayersList');
        homeList.innerHTML = '';
        awayList.innerHTML = '';

        const createCard = (player, team) => {
            const card = document.createElement('div');
            card.className = 'player-card';
            const statusClass = !player.isActive ? 'substituted' : '';
            card.innerHTML = `
                <div class="player-number">${player.number}</div>
                <div class="player-name ${statusClass}">${player.name}</div>
                ${player.position ? `<div class="player-position">${getPositionFullName(player.position)}</div>` : ''}
                <div>
                    <button class="edit-btn">編集</button>
                    ${player.isActive ? `<button class="substitute-btn">交代</button>` : '<span class="substituted-label">交代済</span>'}
                </div>
            `;
            card.querySelector('.edit-btn').addEventListener('click', () => editPlayer(team, player.id));
            if (player.isActive) {
                card.querySelector('.substitute-btn').addEventListener('click', () => substitutePlayer(team, player.id));
            }
            return card;
        };

        homePlayers.sort((a, b) => a.number - b.number).forEach(p => homeList.appendChild(createCard(p, 'home')));
        awayPlayers.sort((a, b) => a.number - b.number).forEach(p => awayList.appendChild(createCard(p, 'away')));
    }

    function updateScoreboard() {
        for (let i = 0; i < 7; i++) {
            document.getElementById(`home-${i + 1}`).textContent = gameData.homeScore[i];
            document.getElementById(`away-${i + 1}`).textContent = gameData.awayScore[i];
        }
        document.getElementById('home-total').textContent = gameData.homeScore.reduce((a, b) => a + b, 0);
        document.getElementById('away-total').textContent = gameData.awayScore.reduce((a, b) => a + b, 0);
    }

    function updateGameStatus() {
        document.getElementById('currentInning').value = gameData.currentInning;
        document.getElementById('topBottom').value = gameData.isTop ? 'top' : 'bottom';
        document.getElementById('outCount').textContent = gameData.outs;
        gameData.bases.forEach((isOccupied, i) => {
            document.getElementById(`base${i + 1}`).classList.toggle('occupied', isOccupied);
        });
        updateBattingTeamSelect();
    }

    function updateBattingTeamSelect() {
        document.getElementById('battingTeam').value = gameData.isTop ? 'away' : 'home';
        updateBatterSelect();
    }

    function updateBatterSelect() {
        const select = document.getElementById('batterSelect');
        select.innerHTML = '<option value="">選手を選択</option>';
        const team = document.getElementById('battingTeam').value;
        const players = (team === 'home' ? homePlayers : awayPlayers).filter(p => p.isActive);
        players.sort((a, b) => a.number - b.number).forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = `${p.number} ${p.name}`;
            select.appendChild(option);
        });
    }

    function updateAtBatHistory() {
        const historyDiv = document.getElementById('atBatHistory');
        historyDiv.innerHTML = '';
        gameData.atBatHistory.slice().reverse().forEach(record => {
            const player = [...homePlayers, ...awayPlayers].find(p => p.id === record.playerId);
            if (!player) return;

            const recordDiv = document.createElement('div');
            recordDiv.className = 'at-bat-record';
            recordDiv.innerHTML = `
                <div class="details">
                    ${record.inning}回${record.isTop ? '表' : '裏'} - ${player.number} ${player.name}: ${getResultText(record.result)}
                    ${record.runs > 0 ? ` (${record.runs}得点)` : ''}
                </div>
                <button class="edit-btn">編集</button>
            `;
            recordDiv.querySelector('.edit-btn').addEventListener('click', () => editAtBat(record.id));
            historyDiv.appendChild(recordDiv);
        });
    }

    function updatePlayerStatsDisplay() {
        const statsDiv = document.getElementById('statsTable');
        const allPlayers = [...homePlayers, ...awayPlayers];
        if (allPlayers.length === 0) {
            statsDiv.innerHTML = '<p>登録された選手がいません</p>';
            return;
        }

        let tableHTML = `
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>チーム</th><th>背番号</th><th>選手名</th><th>守備</th><th>打席</th><th>安打</th><th>打率</th><th>二塁打</th><th>三塁打</th><th>本塁打</th><th>打点</th><th>四球</th><th>三振</th>
                    </tr>
                </thead>
                <tbody>
        `;
        const generateRow = (player) => {
            const stats = player.stats;
            const avg = stats.atBats > 0 ? (stats.hits / stats.atBats).toFixed(3) : '.000';
            return `
                <tr>
                    <td>${player.team === 'home' ? gameData.homeTeamName : gameData.awayTeamName}</td>
                    <td>${player.number}</td>
                    <td>${player.name}</td>
                    <td>${getPositionFullName(player.position) || '-'}</td>
                    <td>${stats.atBats}</td>
                    <td>${stats.hits}</td>
                    <td>${avg}</td>
                    <td>${stats.doubles}</td>
                    <td>${stats.triples}</td>
                    <td>${stats.homeRuns}</td>
                    <td>${stats.rbis}</td>
                    <td>${stats.walks}</td>
                    <td>${stats.strikeouts}</td>
                </tr>
            `;
        };
        awayPlayers.sort((a, b) => a.number - b.number).forEach(p => tableHTML += generateRow(p));
        homePlayers.sort((a, b) => a.number - b.number).forEach(p => tableHTML += generateRow(p));
        tableHTML += '</tbody></table>';
        statsDiv.innerHTML = tableHTML;
    }

    function updateSubstitutionHistory() {
        const historyDiv = document.getElementById('substitutionHistory');
        if (!gameData.substitutionHistory || gameData.substitutionHistory.length === 0) {
            historyDiv.innerHTML = '<p>交代記録はありません</p>';
            return;
        }
        let html = '<div class="substitution-records">';
        gameData.substitutionHistory.forEach(r => {
            html += `
                <div class="substitution-record">
                    <div class="substitution-info"><strong>${r.inning}回${r.half}</strong> - ${r.team}: ${r.outPlayer} → ${r.inPlayer} (${getPositionFullName(r.position)})</div>
                    <div class="substitution-time">${r.timestamp}</div>
                </div>
            `;
        });
        historyDiv.innerHTML = html + '</div>';
    }

    // =====================================================================================
    // アクション関数
    // =====================================================================================
    function addPlayer() {
        const team = document.getElementById('playerTeam').value;
        const name = document.getElementById('playerName').value.trim();
        const number = parseInt(document.getElementById('playerNumber').value);
        const position = document.getElementById('playerPosition').value;

        if (!name || isNaN(number)) {
            showMessage('選手名と背番号を入力してください', 'error', 'addPlayerErrorDisplay');
            return;
        }
        const players = team === 'home' ? homePlayers : awayPlayers;
        if (players.some(p => p.number === number && p.isActive)) {
            showMessage('その背番号は既に使用されています', 'error', 'addPlayerErrorDisplay');
            return;
        }

        const newPlayer = { id: Date.now(), name, number, position, team, isActive: true, stats: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, walks: 0, strikeouts: 0, rbis: 0 } };
        players.push(newPlayer);
        savePlayerToMaster(team === 'home' ? gameData.homeTeamName : gameData.awayTeamName, { name, number });
        document.getElementById('playerName').value = '';
        document.getElementById('playerNumber').value = '';
        document.getElementById('playerPosition').value = '';
        saveAndRefresh();
        showMessage('選手を追加しました', 'success');
    }

    function addSamplePlayers(team) {
        const players = team === 'home' ? homePlayers : awayPlayers;
        const teamName = team === 'home' ? gameData.homeTeamName : gameData.awayTeamName;
        players.length = 0; // 既存選手をクリア
        for (let i = 1; i <= 9; i++) {
            players.push({ id: Date.now() + i, name: `選手${i}`, number: i, position: '', team, isActive: true, stats: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, walks: 0, strikeouts: 0, rbis: 0 } });
        }
        saveAndRefresh();
        showMessage(`${teamName}にサンプル選手を追加しました`, 'success');
    }

    function toggleBase(baseIndex) {
        gameData.bases[baseIndex] = !gameData.bases[baseIndex];
        saveAndRefresh();
    }

    function addOut() {
        gameData.outs++;
        if (gameData.outs >= 3) {
            changeInning();
        } else {
            saveAndRefresh();
        }
    }

    function resetOuts() {
        gameData.outs = 0;
        saveAndRefresh();
    }

    function changeInning() {
        if (!gameData.isTop) {
            if (gameData.currentInning < 7) gameData.currentInning++;
        }
        gameData.isTop = !gameData.isTop;
        gameData.outs = 0;
        gameData.bases = [false, false, false];
        saveAndRefresh();
    }

    function recordAtBat() {
        const batterId = document.getElementById('batterSelect').value;
        const result = document.getElementById('atBatResult').value;
        const runs = parseInt(document.getElementById('runsScored').value) || 0;

        if (!batterId || !result) {
            showMessage('打者と結果を選択してください', 'error');
            return;
        }
        const player = [...homePlayers, ...awayPlayers].find(p => p.id == batterId);
        if (!player) return;

        updatePlayerStats(player, result, runs, false);
        if (runs > 0) {
            const scoreTeam = player.team === 'home' ? 'homeScore' : 'awayScore';
            gameData[scoreTeam][gameData.currentInning - 1] += runs;
        }
        gameData.atBatHistory.push({ id: Date.now(), playerId: player.id, result, runs, inning: gameData.currentInning, isTop: gameData.isTop });

        if (['strikeout', 'groundout', 'flyout'].includes(result)) {
            addOut();
        } else {
            saveAndRefresh();
        }
        document.getElementById('atBatResult').value = '';
        document.getElementById('runsScored').value = '0';
        showMessage('打席結果を記録しました', 'success');
    }

    function clearHistory() {
        if (confirm('打席記録履歴をクリアしますか？選手の打撃成績もリセットされます。')) {
            gameData.atBatHistory = [];
            [...homePlayers, ...awayPlayers].forEach(p => {
                p.stats = { atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, walks: 0, strikeouts: 0, rbis: 0 };
            });
            saveAndRefresh();
            showMessage('履歴をクリアしました', 'success');
        }
    }

    function updatePlayerStats(player, result, runs, isReverting = false) {
        const stats = player.stats;
        const multiplier = isReverting ? -1 : 1;
        if (!['walk', 'hbp'].includes(result)) {
            stats.atBats += multiplier;
        }
        if (['single', 'double', 'triple', 'homerun', 'runningHomerun'].includes(result)) {
            stats.hits += multiplier;
        }
        if (result === 'double') stats.doubles += multiplier;
        if (result === 'triple') stats.triples += multiplier;
        if (['homerun', 'runningHomerun'].includes(result)) stats.homeRuns += multiplier;
        if (['walk', 'hbp'].includes(result)) stats.walks += multiplier;
        if (result === 'strikeout') stats.strikeouts += multiplier;
        stats.rbis += (runs * multiplier);
    }

    // =====================================================================================
    // モーダル
    // =====================================================================================
    function openModal(modalId) { document.getElementById(modalId).classList.add('visible'); }
    function closeModal(modalId) { document.getElementById(modalId).classList.remove('visible'); }

    function editPlayer(team, playerId) {
        const player = (team === 'home' ? homePlayers : awayPlayers).find(p => p.id === playerId);
        if (!player) return;
        currentEditPlayerData = { team, player };
        document.getElementById('editPlayerName').value = player.name;
        document.getElementById('editPlayerNumber').value = player.number;
        document.getElementById('editPlayerPosition').value = player.position;
        openModal('editPlayerModal');
    }

    function confirmEditPlayer() {
        if (!currentEditPlayerData) return;
        const { player } = currentEditPlayerData;
        player.name = document.getElementById('editPlayerName').value.trim();
        player.number = parseInt(document.getElementById('editPlayerNumber').value);
        player.position = document.getElementById('editPlayerPosition').value;
        closeModal('editPlayerModal');
        saveAndRefresh();
    }

    function deletePlayer() {
        if (!currentEditPlayerData) return;
        if (confirm('この選手を削除しますか？')) {
            const { team, player } = currentEditPlayerData;
            const players = team === 'home' ? homePlayers : awayPlayers;
            const index = players.findIndex(p => p.id === player.id);
            if (index > -1) players.splice(index, 1);
            closeModal('editPlayerModal');
            saveAndRefresh();
        }
    }

    function substitutePlayer(team, playerId) {
        const player = (team === 'home' ? homePlayers : awayPlayers).find(p => p.id === playerId);
        if (!player) return;
        currentSubstitutionData = { team, player };
        document.getElementById('substitutionPlayerInfo').textContent = `交代対象: ${player.name}`;
        openModal('substitutionModal');
    }

    function confirmSubstitution() {
        if (!currentSubstitutionData) return;
        const { team, player } = currentSubstitutionData;
        const newName = document.getElementById('newPlayerName').value.trim();
        const newNumber = parseInt(document.getElementById('newPlayerNumber').value);
        const newPosition = document.getElementById('newPlayerPosition').value;
        player.isActive = false;
        const newPlayer = { id: Date.now(), name: newName, number: newNumber, position: newPosition, team, isActive: true, stats: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, walks: 0, strikeouts: 0, rbis: 0 } };
        (team === 'home' ? homePlayers : awayPlayers).push(newPlayer);
        gameData.substitutionHistory.push({ outPlayer: player.name, inPlayer: newName, inning: gameData.currentInning, half: gameData.isTop ? '表' : '裏', team: team === 'home' ? gameData.homeTeamName : gameData.awayTeamName, position: newPosition, timestamp: new Date().toLocaleTimeString() });
        closeModal('substitutionModal');
        saveAndRefresh();
    }

    function editAtBat(recordId) {
        const record = gameData.atBatHistory.find(r => r.id === recordId);
        if (!record) return;
        currentEditingAtBatId = recordId;
        document.getElementById('editAtBatResult').value = record.result;
        document.getElementById('editRunsScored').value = record.runs;
        openModal('editAtBatModal');
    }

    function confirmEditAtBat() {
        if (!currentEditingAtBatId) return;
        const record = gameData.atBatHistory.find(r => r.id === currentEditingAtBatId);
        if (!record) return;
        const player = [...homePlayers, ...awayPlayers].find(p => p.id === record.playerId);
        updatePlayerStats(player, record.result, record.runs, true);
        const scoreTeam = player.team === 'home' ? 'homeScore' : 'awayScore';
        gameData[scoreTeam][record.inning - 1] -= record.runs;
        record.result = document.getElementById('editAtBatResult').value;
        record.runs = parseInt(document.getElementById('editRunsScored').value) || 0;
        updatePlayerStats(player, record.result, record.runs, false);
        gameData[scoreTeam][record.inning - 1] += record.runs;
        closeModal('editAtBatModal');
        saveAndRefresh();
    }

    function openPlayerMasterModal() {
        const team = document.getElementById('playerTeam').value;
        const teamName = team === 'home' ? gameData.homeTeamName : gameData.awayTeamName;
        const listDiv = document.getElementById('playerMasterList');
        listDiv.innerHTML = '';
        const tx = db.transaction(playerStoreName, 'readonly');
        const index = tx.objectStore(playerStoreName).index('teamName');
        const request = index.getAll(teamName);
        request.onsuccess = () => {
            const players = request.result;
            if (players.length === 0) {
                listDiv.innerHTML = '<p>登録選手なし</p>';
            } else {
                players.sort((a, b) => a.number - b.number).forEach(player => {
                    const item = document.createElement('div');
                    item.className = 'player-master-item';
                    item.innerHTML = `<span>${player.number} ${player.name}</span><button class="edit-master-btn">編集</button>`;
                    item.querySelector('span').addEventListener('click', () => addPlayerFromMaster(player));
                    item.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); openEditPlayerMasterModal(player); });
                    listDiv.appendChild(item);
                });
            }
            openModal('playerMasterModal');
        };
    }

    function addPlayerFromMaster(player) {
        const team = document.getElementById('playerTeam').value;
        const players = team === 'home' ? homePlayers : awayPlayers;
        if (players.some(p => p.number === player.number)) {
            showMessage('その背番号は既に使用されています', 'error', 'playerMasterModalErrorDisplay');
            return;
        }
        const newPlayer = { ...player, id: Date.now(), team, isActive: true, stats: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, walks: 0, strikeouts: 0, rbis: 0 } };
        players.push(newPlayer);
        closeModal('playerMasterModal');
        saveAndRefresh();
    }

    function openEditPlayerMasterModal(player) {
        currentEditingMasterPlayer = player;
        document.getElementById('editPlayerMasterName').value = player.name;
        document.getElementById('editPlayerMasterNumber').value = player.number;
        openModal('editPlayerMasterModal');
    }

    function confirmEditPlayerMaster() {
        if (!currentEditingMasterPlayer) return;
        const newName = document.getElementById('editPlayerMasterName').value.trim();
        const newNumber = parseInt(document.getElementById('editPlayerMasterNumber').value);
        const originalPlayer = currentEditingMasterPlayer;
        const tx = db.transaction(playerStoreName, 'readwrite');
        const store = tx.objectStore(playerStoreName);
        store.delete([originalPlayer.teamName, originalPlayer.number]);
        store.put({ teamName: originalPlayer.teamName, name: newName, number: newNumber });
        tx.oncomplete = () => {
            closeModal('editPlayerMasterModal');
            closeModal('playerMasterModal');
            showMessage('選手マスタを更新しました', 'success');
        };
    }

    function deletePlayerFromMaster() {
        if (!currentEditingMasterPlayer) return;
        if (confirm('マスタからこの選手を完全に削除しますか？')) {
            const player = currentEditingMasterPlayer;
            const tx = db.transaction(playerStoreName, 'readwrite');
            tx.objectStore(playerStoreName).delete([player.teamName, player.number]);
            tx.oncomplete = () => {
                closeModal('editPlayerMasterModal');
                closeModal('playerMasterModal');
                showMessage('選手をマスタから削除しました', 'success');
            };
        }
    }
    
    function makeScoreEditable() {
        for (let team of ['home', 'away']) {
            for (let inning = 1; inning <= 7; inning++) {
                const cell = document.getElementById(`${team}-${inning}`);
                cell.addEventListener('click', function() {
                    if (this.querySelector('input')) return;
                    const currentValue = this.textContent;
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.value = currentValue;
                    input.min = '0';
                    input.style.width = '50px';
                    input.style.textAlign = 'center';
                    this.innerHTML = '';
                    this.appendChild(input);
                    input.focus();
                    input.select();
                    const saveScore = () => {
                        const newValue = parseInt(input.value) || 0;
                        const scoreTeam = team === 'home' ? 'homeScore' : 'awayScore';
                        gameData[scoreTeam][inning - 1] = newValue;
                        saveAndRefresh();
                    };
                    input.addEventListener('blur', saveScore);
                    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.blur(); });
                });
            }
        }
    }

    // =====================================================================================
    // ヘルパー関数
    // =====================================================================================
    function showMessage(message, type, targetElementId = null) {
        let container = document.getElementById(targetElementId);
        if (!container) {
            container = document.querySelector('.global-message-container');
            if (!container) {
                container = document.createElement('div');
                container.className = 'global-message-container';
                document.body.appendChild(container);
            }
        }
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${type}`;
        msgDiv.textContent = message;
        if (targetElementId) container.innerHTML = '';
        container.appendChild(msgDiv);
        setTimeout(() => msgDiv.remove(), 3000);
    }

    function getPositionFullName(abbr) {
        const map = { P: 'ピッチャー', C: 'キャッチャー', '1B': 'ファースト', '2B': 'セカンド', '3B': 'サード', SS: 'ショート', LF: 'レフト', CF: 'センター', RF: 'ライト', DH: '指名打者' };
        return map[abbr] || abbr;
    }

    function getResultText(result) {
        const map = { single: '単打', double: '二塁打', triple: '三塁打', homerun: 'ホームラン', runningHomerun: 'ランニングホームラン', walk: 'フォアボール', hbp: 'デッドボール', strikeout: '三振', strikeoutWildPitch: '振り逃げ', groundout: 'ゴロアウト', flyout: 'フライアウト', error: 'エラー' };
        return map[result] || result;
    }

    function savePlayerToMaster(teamName, player) {
        if (!db) return;
        const transaction = db.transaction([playerStoreName], "readwrite");
        const store = transaction.objectStore(playerStoreName);
        store.put({ teamName: teamName, ...player });
    }

    // =====================================================================================
    // PDF生成
    // =====================================================================================
    function downloadGamePDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const content = document.createElement('div');
        content.style.cssText = `position: absolute; left: -9999px; top: 0; width: 800px; background: white; padding: 20px; font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', 'Meiryo', sans-serif; font-size: 12px; line-height: 1.5;`;

        const getResultTextForPDF = () => {
            const result = gameData.result;
            if (!result) return '未確定';
            if (result === 'home-win') return `${gameData.homeTeamName}勝利`;
            if (result === 'away-win') return `${gameData.awayTeamName}勝利`;
            return '引き分け';
        };

        const generateScoreRow = (team) => {
            let html = '';
            const scores = team === 'home' ? gameData.homeScore : gameData.awayScore;
            let total = 0;
            for (let i = 0; i < 7; i++) {
                const score = scores[i] || 0;
                total += score;
                html += `<td style="border: 1px solid #333; padding: 8px; text-align: center;">${score}</td>`;
            }
            html += `<td style="border: 1px solid #333; padding: 8px; text-align: center; font-weight: bold; background: #e0e0e0;">${total}</td>`;
            return html;
        };

        const generatePlayerStatsRows = () => {
            let html = '';
            const header = `
                <tr style="background: #f0f0f0;">
                    <th style="border: 1px solid #333; padding: 6px;">背番号</th>
                    <th style="border: 1px solid #333; padding: 6px;">選手名</th>
                    <th style="border: 1px solid #333; padding: 6px;">守備</th>
                    <th style="border: 1px solid #333; padding: 6px;">打席</th>
                    <th style="border: 1px solid #333; padding: 6px;">安打</th>
                    <th style="border: 1px solid #333; padding: 6px;">打率</th>
                    <th style="border: 1px solid #333; padding: 6px;">打点</th>
                </tr>`;
            const row = (player) => {
                const stats = player.stats || { atBats: 0, hits: 0, rbis: 0 };
                const average = stats.atBats > 0 ? (stats.hits / stats.atBats).toFixed(3) : '.000';
                return `
                    <tr>
                        <td style="border: 1px solid #333; padding: 6px; text-align: center;">${player.number}</td>
                        <td style="border: 1px solid #333; padding: 6px;">${player.name}</td>
                        <td style="border: 1px solid #333; padding: 6px; text-align: center;">${getPositionFullName(player.position) || ''}</td>
                        <td style="border: 1px solid #333; padding: 6px; text-align: center;">${stats.atBats}</td>
                        <td style="border: 1px solid #333; padding: 6px; text-align: center;">${stats.hits}</td>
                        <td style="border: 1px solid #333; padding: 6px; text-align: center;">${average}</td>
                        <td style="border: 1px solid #333; padding: 6px; text-align: center;">${stats.rbis}</td>
                    </tr>`;
            };
            html += `<h3 style="font-size: 14px; margin-top: 15px; margin-bottom: 5px;">${gameData.awayTeamName} 選手別打撃成績</h3>`;
            html += `<table style="width: 100%; border-collapse: collapse; font-size: 10px;">${header}`;
            awayPlayers.sort((a, b) => a.number - b.number).forEach(p => html += row(p));
            html += '</table>';
            html += `<h3 style="font-size: 14px; margin-top: 15px; margin-bottom: 5px;">${gameData.homeTeamName} 選手別打撃成績</h3>`;
            html += `<table style="width: 100%; border-collapse: collapse; font-size: 10px;">${header}`;
            homePlayers.sort((a, b) => a.number - b.number).forEach(p => html += row(p));
            html += '</table>';
            return html;
        };

        const generateAtBatHistoryRows = () => {
            if (!gameData.atBatHistory || gameData.atBatHistory.length === 0) return '<p>打席記録はありません</p>';
            let html = '<table style="width: 100%; border-collapse: collapse; font-size: 10px;">';
            html += `
                <tr style="background: #f0f0f0;">
                    <th style="border: 1px solid #333; padding: 6px;">イニング</th>
                    <th style="border: 1px solid #333; padding: 6px;">チーム</th>
                    <th style="border: 1px solid #333; padding: 6px;">選手名</th>
                    <th style="border: 1px solid #333; padding: 6px;">結果</th>
                    <th style="border: 1px solid #333; padding: 6px;">得点</th>
                </tr>`;
            const allPlayers = [...homePlayers, ...awayPlayers];
            gameData.atBatHistory.forEach(record => {
                const player = allPlayers.find(p => p.id === record.playerId);
                html += `
                    <tr>
                        <td style="border: 1px solid #333; padding: 6px; text-align: center;">${record.inning}回${record.isTop ? '表' : '裏'}</td>
                        <td style="border: 1px solid #333; padding: 6px;">${player.team === 'home' ? gameData.homeTeamName : gameData.awayTeamName}</td>
                        <td style="border: 1px solid #333; padding: 6px;">${player ? player.name : ''}</td>
                        <td style="border: 1px solid #333; padding: 6px;">${getResultText(record.result)}</td>
                        <td style="border: 1px solid #333; padding: 6px; text-align: center;">${record.runs}</td>
                    </tr>`;
            });
            html += '</table>';
            return html;
        };

        const generateSubstitutionHistoryRows = () => {
            if (!gameData.substitutionHistory || gameData.substitutionHistory.length === 0) return '';
            let html = `<div style="margin-bottom: 15px;"><h2 style="font-size: 16px; border-bottom: 1px solid #333; padding-bottom: 5px;">選手交代履歴</h2>`;
            gameData.substitutionHistory.forEach(record => {
                html += `<div style="margin: 5px 0; padding: 5px; border-bottom: 1px solid #ddd; font-size: 10px;">
                    <strong>${record.inning}回${record.half}</strong> - ${record.team}: ${record.outPlayer} → ${record.inPlayer} (${getPositionFullName(record.position)})
                </div>`;
            });
            html += '</div>';
            return html;
        };

        content.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="font-size: 20px; margin: 0;">⚾ 少年野球試合記録</h1>
                <p style="font-size: 14px; margin: 5px 0;">試合日: ${gameData.date}</p>
            </div>
            <div style="margin-bottom: 15px;">
                <h2 style="font-size: 16px; border-bottom: 1px solid #333; padding-bottom: 5px;">試合情報</h2>
                <p><strong>会場:</strong> ${gameData.location || '未設定'}</p>
                <p><strong>対戦:</strong> ${gameData.awayTeamName} vs ${gameData.homeTeamName}</p>
                <p><strong>結果:</strong> ${getResultTextForPDF()}</p>
            </div>
            <div style="margin-bottom: 15px;">
                <h2 style="font-size: 16px; border-bottom: 1px solid #333; padding-bottom: 5px;">スコア</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="background: #f0f0f0;">
                        <th style="border: 1px solid #333; padding: 8px;">チーム</th> ${[...Array(7).keys()].map(i => `<th style="border: 1px solid #333; padding: 8px;">${i+1}回</th>`).join('')} <th style="border: 1px solid #333; padding: 8px;">合計</th>
                    </tr>
                    <tr><td style="border: 1px solid #333; padding: 8px; font-weight: bold;">${gameData.awayTeamName}</td>${generateScoreRow('away')}</tr>
                    <tr><td style="border: 1px solid #333; padding: 8px; font-weight: bold;">${gameData.homeTeamName}</td>${generateScoreRow('home')}</tr>
                </table>
            </div>
            <div style="margin-bottom: 15px; page-break-before: auto;">
                <h2 style="font-size: 16px; border-bottom: 1px solid #333; padding-bottom: 5px;">選手別成績</h2>
                ${generatePlayerStatsRows()}
            </div>
            <div style="margin-bottom: 15px; page-break-before: auto;">
                <h2 style="font-size: 16px; border-bottom: 1px solid #333; padding-bottom: 5px;">打席記録履歴</h2>
                ${generateAtBatHistoryRows()}
            </div>
            ${generateSubstitutionHistoryRows()}
        `;

        document.body.appendChild(content);
        html2canvas(content, { scale: 2, useCORS: true }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = 210; // A4 width in mm
            const pageHeight = 297; // A4 height in mm
            const imgHeight = canvas.height * imgWidth / canvas.width;
            let heightLeft = imgHeight;
            let position = 0;
            doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                doc.addPage();
                doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }
            doc.save(`score_${gameData.date}.pdf`);
            document.body.removeChild(content);
            showMessage('PDFをダウンロードしました', 'success');
        }).catch(err => {
            console.error("PDF generation error:", err);
            showMessage('PDFの生成に失敗しました', 'error');
            if(document.body.contains(content)) document.body.removeChild(content);
        });
    }
});
