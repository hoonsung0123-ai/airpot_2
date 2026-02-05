const RealtimeMatch = {
  myId: null,
  myData: null,
  roomId: null,
  isHost: false,
  onMatchFound: null,
  onOpponentChoice: null,
  onOpponentLeft: null,
  _listeners: [],
  _matchRef: null,
  _roomRef: null,

  init() {
    this.myId = localStorage.getItem('player_id') || 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    localStorage.setItem('player_id', this.myId);
    window.addEventListener('beforeunload', () => this.leave());
    this._listeners = [];
    console.log('[RealtimeMatch] Initialized', this.myId);
    return this;
  },

  findMatch(matchData) {
    if (!firebase?.database) return alert('Firebase not initialized');
    this.myData = matchData;
    const db = firebase.database();
    const matchKey = matchData.model.replace(/\s+/g, '_');
    const lookingForRef = db.ref(`matchQueue/${matchKey}/${matchData.needSide}`);

    // 먼저 큐에 있는 상대 확인
    lookingForRef.orderByChild('timestamp').limitToFirst(1).once('value', snapshot => {
      const data = snapshot.val();
      if (data) {
        const opponentId = Object.keys(data)[0];
        if (opponentId !== this.myId) {
          console.log('[RealtimeMatch] Opponent found', opponentId);
          this._createRoom(opponentId, data[opponentId]);
          lookingForRef.child(opponentId).remove();
          return;
        }
      }
      // 없으면 큐에 등록
      this._joinQueue(matchKey);
    });
  },

  _joinQueue(matchKey) {
    const db = firebase.database();
    const myQueueRef = db.ref(`matchQueue/${matchKey}/${this.myData.mySide}/${this.myId}`);
    this._matchRef = myQueueRef;
    myQueueRef.set({
      ...this.myData,
      playerId: this.myId,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    const myRoomRef = db.ref(`playerRooms/${this.myId}`);
    myRoomRef.on('value', snapshot => {
      const roomData = snapshot.val();
      if (roomData?.roomId) {
        this.roomId = roomData.roomId;
        this.isHost = false;
        myQueueRef.remove();
        myRoomRef.remove();
        if (this.onMatchFound) this.onMatchFound(this.roomId, false, roomData.opponentData);
      }
    });
    this._listeners.push({ ref: myRoomRef, event: 'value' });
  },

  _createRoom(opponentId, opponentData) {
    const db = firebase.database();
    const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    this.roomId = roomId;
    this.isHost = true;

    const roomRef = db.ref(`gameRooms/${roomId}`);
    roomRef.set({
      hostId: this.myId,
      guestId: opponentId,
      hostChoice: null,
      guestChoice: null,
      round: 1,
      status: 'playing',
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });

    db.ref(`playerRooms/${opponentId}`).set({
      roomId,
      opponentData: this.myData
    });

    if (this.onMatchFound) this.onMatchFound(roomId, true, opponentData);
  },

  joinRoom(roomId, isHost) {
    this.roomId = roomId;
    this.isHost = isHost;
    const db = firebase.database();
    const roomRef = db.ref(`gameRooms/${roomId}`);
    this._roomRef = roomRef;

    roomRef.on('value', snapshot => {
      const room = snapshot.val();
      if (!room) { if (this.onOpponentLeft) this.onOpponentLeft(); return; }

      const opponentChoice = isHost ? room.guestChoice : room.hostChoice;
      if (opponentChoice && this.onOpponentChoice) this.onOpponentChoice(opponentChoice);
      if (room.status === 'abandoned' && this.onOpponentLeft) this.onOpponentLeft();
    });
    this._listeners.push({ ref: roomRef, event: 'value' });
  },

  sendChoice(choice) {
    if (!this.roomId) return console.error('[RealtimeMatch] No room');
    const db = firebase.database();
    const choiceKey = this.isHost ? 'hostChoice' : 'guestChoice';
    db.ref(`gameRooms/${this.roomId}/${choiceKey}`).set(choice);
  },

  resetRound() {
    if (!this.roomId) return;
    firebase.database().ref(`gameRooms/${this.roomId}`).update({
      hostChoice: null,
      guestChoice: null,
      round: firebase.database.ServerValue.increment(1)
    });
  },

  leave() {
    this._listeners.forEach(({ ref, event }) => ref.off(event));
    this._listeners = [];
    if (this._matchRef) this._matchRef.remove();
    if (this._roomRef) this._roomRef.update({ status: 'abandoned' });
  },

  clearAll() {
    const db = firebase.database();
    db.ref('matchQueue').remove();
    db.ref('gameRooms').remove();
    db.ref('playerRooms').remove();
  }
};
