document.addEventListener('DOMContentLoaded', () => {
    // グローバル変数
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

    // DOM要素
    const elements = {
        // Buttons
        helpButton: document.getElementById('helpButton'),
        downloadPdfButton: document.getElementById('downloadPdfButton'),
        resetGameButton: document.getElementById('resetGameButton'),
        addPlayerButton: document.getElementById('addPlayerButton'),
        openPlayerMasterModalButton: document.getElementById('openPlayerMasterModalButton'),
        addSampleHomePlayersButton: document.getElementById('addSampleHomePlayersButton'),
        addSampleAwayPlayersButton: document.getElementById('addSampleAwayPlayersButton'),
        addOutButton: document.getElementById('addOutButton'),
        resetOutsButton: document.getElementById('resetOutsButton'),
        recordAtBatButton: document.getElementById('recordAtBatButton'),
        clearHistoryButton: document.getElementById('clearHistoryButton'),
        // Modals
        helpModal: document.getElementById('helpModal'),
        substitutionModal: document.getElementById('substitutionModal'),
        editPlayerModal: document.getElementById('editPlayerModal'),
        editAtBatModal: document.getElementById('editAtBatModal'),
        playerMasterModal: document.getElementById('playerMasterModal'),
        editPlayerMasterModal: document.getElementById('editPlayerMasterModal'),
        // Modal Close Buttons
        closeHelpModalButton: document.getElementById('closeHelpModalButton'),
        cancelHelpModalButton: document.getElementById('cancelHelpModalButton'),
        closeSubstitutionModalButton: document.getElementById('closeSubstitutionModalButton'),
        cancelSubstitutionButton: document.getElementById('cancelSubstitutionButton'),
        closeEditPlayerModalButton: document.getElementById('closeEditPlayerModalButton'),
        cancelEditPlayerButton: document.getElementById('cancelEditPlayerButton'),
        closeEditAtBatModalButton: document.getElementById('closeEditAtBatModalButton'),
        cancelEditAtBatButton: document.getElementById('cancelEditAtBatButton'),
        closePlayerMasterModalButton: document.getElementById('closePlayerMasterModalButton'),
        cancelPlayerMasterModalButton: document.getElementById('cancelPlayerMasterModalButton'),
        closeEditPlayerMasterModalButton: document.getElementById('closeEditPlayerMasterModalButton'),
        cancelEditPlayerMasterButton: document.getElementById('cancelEditPlayerMasterButton'),
        // Modal Confirm Buttons
        confirmSubstitutionButton: document.getElementById('confirmSubstitutionButton'),
        confirmEditPlayerButton: document.getElementById('confirmEditPlayerButton'),
        deletePlayerButton: document.getElementById('deletePlayerButton'),
        confirmEditAtBatButton: document.getElementById('confirmEditAtBatButton'),
        confirmEditPlayerMasterButton: document.getElementById('confirmEditPlayerMasterButton'),
        deletePlayerFromMasterButton: document.getElementById('deletePlayerFromMasterButton'),
    };

    // 初期化
    async function initializeApp() {
        await initDB();
        resetGameData();
        await loadGameData();
        setupEventListeners();
        updateAllDisplays();
        console.log("App initialized");
    }

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 4); // Increment version for schema changes
            request.onerror = (event) => reject("Database error: " + event.target.errorCode);
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
        // General UI
        elements.helpButton.addEventListener('click', () => openModal('helpModal'));
        elements.downloadPdfButton.addEventListener('click', downloadGamePDF);
        elements.resetGameButton.addEventListener('click', resetGame);

        // Player Registration
        elements.addPlayerButton.addEventListener('click', addPlayer);
        elements.openPlayerMasterModalButton.addEventListener('click', openPlayerMasterModal);
        elements.addSampleHomePlayersButton.addEventListener('click', () => addSamplePlayers('home'));
        elements.addSampleAwayPlayersButton.addEventListener('click', () => addSamplePlayers('away'));

        // Scoreboard
        elements.addOutButton.addEventListener('click', addOut);
        elements.resetOutsButton.addEventListener('click', resetOuts);
        document.getElementById('base1').addEventListener('click', () => toggleBase(0));
        document.getElementById('base2').addEventListener('click', () => toggleBase(1));
        document.getElementById('base3').addEventListener('click', () => toggleBase(2));

        // At-Bat
        elements.recordAtBatButton.addEventListener('click', recordAtBat);
        elements.clearHistoryButton.addEventListener('click', clearHistory);

        // Team & Game Info
        document.getElementById('homeTeamName').addEventListener('input', updateTeamNames);
        document.getElementById('awayTeamName').addEventListener('input', updateTeamNames);
        document.getElementById('gameDate').addEventListener('change', saveGameInfo);
        document.getElementById('gameLocation').addEventListener('change', saveGameInfo);
        document.getElementById('gameStatus').addEventListener('change', saveGameInfo);
        document.getElementById('gameResult').addEventListener('change', saveGameInfo);
        document.getElementById('currentInning').addEventListener('change', () => { gameData.currentInning = parseInt(document.getElementById('currentInning').value); saveAndRefresh(); });
        document.getElementById('topBottom').addEventListener('change', () => { gameData.isTop = document.getElementById('topBottom').value === 'top'; saveAndRefresh(); });
        document.getElementById('battingTeam').addEventListener('change', updateBatterSelect);

        // Modal Close Buttons
        elements.closeHelpModalButton.addEventListener('click', () => closeModal('helpModal'));
        elements.cancelHelpModalButton.addEventListener('click', () => closeModal('helpModal'));
        elements.closeSubstitutionModalButton.addEventListener('click', () => closeModal('substitutionModal'));
        elements.cancelSubstitutionButton.addEventListener('click', () => closeModal('substitutionModal'));
        elements.closeEditPlayerModalButton.addEventListener('click', () => closeModal('editPlayerModal'));
        elements.cancelEditPlayerButton.addEventListener('click', () => closeModal('editPlayerModal'));
        elements.closeEditAtBatModalButton.addEventListener('click', () => closeModal('editAtBatModal'));
        elements.cancelEditAtBatButton.addEventListener('click', () => closeModal('editAtBatModal'));
        elements.closePlayerMasterModalButton.addEventListener('click', () => closeModal('playerMasterModal'));
        elements.cancelPlayerMasterModalButton.addEventListener('click', () => closeModal('playerMasterModal'));
        elements.closeEditPlayerMasterModalButton.addEventListener('click', () => closeModal('editPlayerMasterModal'));
        elements.cancelEditPlayerMasterButton.addEventListener('click', () => closeModal('editPlayerMasterModal'));

        // Modal Action Buttons
        elements.confirmSubstitutionButton.addEventListener('click', confirmSubstitution);
        elements.confirmEditPlayerButton.addEventListener('click', confirmEditPlayer);
        elements.deletePlayerButton.addEventListener('click', deletePlayer);
        elements.confirmEditAtBatButton.addEventListener('click', confirmEditAtBat);
        elements.confirmEditPlayerMasterButton.addEventListener('click', confirmEditPlayerMaster);
        elements.deletePlayerFromMasterButton.addEventListener('click', deletePlayerFromMaster);
    }

    // ===== データ管理 =====
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
            request.onerror = () => resolve(); // Continue even if load fails
        });
    }

    function resetGame() {
        if (confirm('現在の試合データをすべてリセットしますか？')) {
            resetGameData();
            if (db) {
                db.transaction([gameDataStoreName], "readwrite").objectStore(gameDataStoreName).delete("current_game");
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

    // ===== UI更新 =====
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
        // Set initial values from gameData
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
        const homeName = document.getElementById('homeTeamName').value || '後攻チーム';
        const awayName = document.getElementById('awayTeamName').value || '先攻チーム';
        gameData.homeTeamName = homeName;
        gameData.awayTeamName = awayName;

        document.getElementById('homeTeamNameDisplay').textContent = homeName;
        document.getElementById('awayTeamNameDisplay').textContent = awayName;
        document.getElementById('homeTeamPlayersTitle').textContent = `${homeName} 選手`;
        document.getElementById('awayTeamPlayersTitle').textContent = `${awayName} 選手`;
        document.getElementById('playerTeam').options[0].textContent = awayName;
        document.getElementById('playerTeam').options[1].textContent = homeName;
        document.getElementById('battingTeam').options[0].textContent = awayName;
        document.getElementById('battingTeam').options[1].textContent = homeName;
        updateGameResultOptions();
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

    // ===== アクション関数 =====
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

        const newPlayer = {
            id: Date.now(), name, number, position, team, isActive: true,
            stats: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, walks: 0, strikeouts: 0, rbis: 0 }
        };
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
        players.length = 0; // Clear existing players
        for (let i = 1; i <= 9; i++) {
            players.push({
                id: Date.now() + i, name: `選手${i}`, number: i, position: '', team, isActive: true,
                stats: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, walks: 0, strikeouts: 0, rbis: 0 }
            });
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
            gameData.currentInning++;
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

        // Update stats, score, history
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
        if (confirm('打席記録履歴をクリアしますか？')) {
            gameData.atBatHistory = [];
            // Optionally reset stats
            [...homePlayers, ...awayPlayers].forEach(p => {
                p.stats = { atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, walks: 0, strikeouts: 0, rbis: 0 };
            });
            saveAndRefresh();
            showMessage('履歴をクリアしました', 'success');
        }
    }

    // ===== モーダル関連 =====
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
        const { team, player } = currentEditPlayerData;
        const newName = document.getElementById('editPlayerName').value.trim();
        const newNumber = parseInt(document.getElementById('editPlayerNumber').value);
        const newPosition = document.getElementById('editPlayerPosition').value;

        player.name = newName;
        player.number = newNumber;
        player.position = newPosition;

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
        const newPlayer = {
            id: Date.now(), name: newName, number: newNumber, position: newPosition, team, isActive: true,
            stats: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, walks: 0, strikeouts: 0, rbis: 0 }
        };
        (team === 'home' ? homePlayers : awayPlayers).push(newPlayer);
        
        gameData.substitutionHistory.push({ outPlayer: player.name, inPlayer: newName, inning: gameData.currentInning });

        closeModal('substitutionModal');
        saveAndRefresh();
    }

    function editAtBat(recordId) {
        const record = gameData.atBatHistory.find(r => r.id === recordId);
        if (!record) return;
        currentEditingAtBatId = recordId;
        // Populate modal
        document.getElementById('editAtBatResult').value = record.result;
        document.getElementById('editRunsScored').value = record.runs;
        openModal('editAtBatModal');
    }

    function confirmEditAtBat() {
        if (!currentEditingAtBatId) return;
        const record = gameData.atBatHistory.find(r => r.id === currentEditingAtBatId);
        if (!record) return;

        // Revert old stats
        const player = [...homePlayers, ...awayPlayers].find(p => p.id === record.playerId);
        updatePlayerStats(player, record.result, record.runs, true);
        const scoreTeam = player.team === 'home' ? 'homeScore' : 'awayScore';
        gameData[scoreTeam][record.inning - 1] -= record.runs;

        // Apply new stats
        record.result = document.getElementById('editAtBatResult').value;
        record.runs = parseInt(document.getElementById('editRunsScored').value) || 0;
        updatePlayerStats(player, record.result, record.runs, false);
        gameData[scoreTeam][record.inning - 1] += record.runs;

        closeModal('editAtBatModal');
        saveAndRefresh();
    }

    // ... (Player Master Modal functions: open, confirm edit, delete)
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
                players.forEach(player => {
                    const item = document.createElement('div');
                    item.className = 'player-master-item';
                    item.innerHTML = `<span>${player.number} ${player.name}</span><button class="edit-master-btn">編集</button>`;
                    item.querySelector('span').addEventListener('click', () => addPlayerFromMaster(player));
                    item.querySelector('button').addEventListener('click', (e) => {
                        e.stopPropagation();
                        openEditPlayerMasterModal(player);
                    });
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
        
        // Delete the old record and add the new one
        store.delete([originalPlayer.teamName, originalPlayer.number]);
        store.put({ teamName: originalPlayer.teamName, name: newName, number: newNumber });

        tx.oncomplete = () => {
            closeModal('editPlayerMasterModal');
            closeModal('playerMasterModal'); // Close the list modal as well
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

    // ===== ヘルパー =====
    function showMessage(message, type, targetElementId = null) {
        let container = document.body;
        if (targetElementId) {
            container = document.getElementById(targetElementId);
        } else {
            // Use a global container for general messages
            let globalContainer = document.querySelector('.global-message-container');
            if (!globalContainer) {
                globalContainer = document.createElement('div');
                globalContainer.className = 'global-message-container';
                document.body.appendChild(globalContainer);
            }
            container = globalContainer;
        }
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${type}`;
        msgDiv.textContent = message;
        if (!targetElementId) {
             container.appendChild(msgDiv);
        } else {
            container.innerHTML = ''; // Clear previous messages in targeted containers
            container.appendChild(msgDiv);
        }
       
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
    
    // PDF ダウンロード（内容は変更なし、呼び出しのみ確認）
    function downloadGamePDF() { console.log('PDF Download triggered'); /* ... implementation ... */ }
    function updatePlayerStats() { /* ... implementation ... */ }
    function updateAtBatHistory() { /* ... implementation ... */ }
    function updatePlayerStatsDisplay() { /* ... implementation ... */ }
    function updateSubstitutionHistory() { /* ... implementation ... */ }

    // アプリケーション開始
    initializeApp();
});