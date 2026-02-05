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

  init: function() {
    this.myId = this._getUserId();
    this._listeners = [];
    window.addEventListener('beforeunload', () => this.leave());
    console.log('[RealtimeMatch] 초기화됨:', this.myId);
    return this;
  },

  _getUserId: function() {
    let id = localStorage.getItem('konghanjok_player_id');
    if (!id) {
      id = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      localStorage.setItem('konghanjok_player_id', id);
    }
    return id;
  },

  findMatch: function(matchData) {
    this.myData = matchData;
    console.log('[RealtimeMatch] 매칭 시작:', matchData);

    if (typeof firebase === 'undefined' || !firebase.database) {
      console.error('[RealtimeMatch] Firebase가 로드되지 않았습니다');
      alert('Firebase 연결 오류. 설정을 확인하세요.');
      return;
    }

    const db = firebase.database();
    const queueRef = db.ref('matchQueue');
    const matchKey = matchData.model.replace(/\s+/g, '_');

    this._joinQueue(matchKey);
  },

  _joinQueue: function(matchKey) {
    const db = firebase.database();
    const myQueueRef = db.ref(`matchQueue/${matchKey}/${this.myData.mySide}/${this.myId}`);
    this._matchRef = myQueueRef;

    // 큐 등록
    myQueueRef.set({
      ...this.myData,
      playerId: this.myId,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    console.log('[RealtimeMatch] 대기열 등록됨');

    // 먼저 needSide에 상대가 생겼는지 감시
    const lookingForRef = db.ref(`matchQueue/${matchKey}/${this.myData.needSide}`);
    const listener = lookingForRef.on('child_added', (snapshot) => {
      const opponentId = snapshot.key;
      const opponentData = snapshot.val();

      if (opponentId === this.myId) return; // 자기 자신 무시

      // 트랜잭션으로 한 사람만 방 생성
      const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
      const roomRef = db.ref('gameRooms/' + roomId);

      roomRef.transaction(currentData => {
        if (currentData === null) {
          return {
            hostId: this.myId,
            guestId: opponentId,
            hostChoice: null,
            guestChoice: null,
            round: 1,
            status: 'playing',
            createdAt: firebase.database.ServerValue.TIMESTAMP
          };
        }
        return; // 이미 방이 있으면 아무것도 안 함
      }, (err, committed, snapshot) => {
        if (err || !committed) return;

        console.log('[RealtimeMatch] 방 생성됨:', roomId);
        this.roomId = roomId;
        this.isHost = true;

        // 상대에게 방 알림
        db.ref(`playerRooms/${opponentId}`).set({
          roomId: roomId,
          opponentData: this.myData
        });

        // 대기열에서 제거
        lookingForRef.child(opponentId).remove();
        myQueueRef.remove();

        if (this.onMatchFound) this.onMatchFound(roomId, true, opponentData);
      });
    });

    this._listeners.push({ ref: lookingForRef, event: 'child_added' });

    // 나에게 방 초대 오는지 감시
    const myRoomRef = db.ref('playerRooms/' + this.myId);
    const myRoomListener = myRoomRef.on('value', (snapshot) => {
      const roomData = snapshot.val();
      if (!roomData || !roomData.roomId) return;

      this.roomId = roomData.roomId;
      this.isHost = false;

      myQueueRef.remove(); // 대기열 제거
      myRoomRef.remove(); // 알림 제거

      console.log('[RealtimeMatch] 방 초대 받음:', this.roomId);

      if (this.onMatchFound) this.onMatchFound(this.roomId, false, roomData.opponentData);
    });

    this._listeners.push({ ref: myRoomRef, event: 'value' });
  },

  joinRoom: function(roomId, isHost) {
    this.roomId = roomId;
    this.isHost = isHost;

    console.log('[RealtimeMatch] 방 참가:', roomId, '호스트:', isHost);

    const db = firebase.database();
    const roomRef = db.ref('gameRooms/' + roomId);
    this._roomRef = roomRef;

    roomRef.on('value', snapshot => {
      const room = snapshot.val();
      if (!room) {
        if (this.onOpponentLeft) this.onOpponentLeft();
        return;
      }

      const opponentChoice = isHost ? room.guestChoice : room.hostChoice;
      if (opponentChoice && this.onOpponentChoice) this.onOpponentChoice(opponentChoice);

      if (room.status === 'abandoned' && this.onOpponentLeft) this.onOpponentLeft();
    });

    this._listeners.push({ ref: roomRef, event: 'value' });
  },

  sendChoice: function(choice) {
    if (!this.roomId) return;

    const db = firebase.database();
    const choiceKey = this.isHost ? 'hostChoice' : 'guestChoice';
    db.ref('gameRooms/' + this.roomId + '/' + choiceKey).set(choice);

    console.log('[RealtimeMatch] 선택 전송:', choice);
  },

  resetRound: function() {
    if (!this.roomId) return;

    const db = firebase.database();
    const roomRef = db.ref('gameRooms/' + this.roomId);
    roomRef.update({
      hostChoice: null,
      guestChoice: null,
      round: firebase.database.ServerValue.increment(1)
    });

    console.log('[RealtimeMatch] 라운드 리셋');
  },

  getQueueInfo: function(callback) {
    if (!this.myData) return;

    const db = firebase.database();
    const matchKey = this.myData.model.replace(/\s+/g, '_');
    const queueRef = db.ref('matchQueue/' + matchKey);

    queueRef.once('value', snapshot => {
      const data = snapshot.val() || {};
      const needSideData = data[this.myData.needSide] || {};
      const mySideData = data[this.myData.mySide] || {};

      const needSideCount = Object.keys(needSideData).filter(id => id !== this.myId).length;
      const mySideCount = Object.keys(mySideData).length;
      const total = needSideCount + mySideCount;
      const hasOpponent = needSideCount > 0;

      callback({ total, hasOpponent, needSideCount, mySideCount });
    });
  },

  leave: function() {
    console.log('[RealtimeMatch] 나가기');
    this._listeners.forEach(({ ref, event }) => ref.off(event));
    this._listeners = [];

    if (this._matchRef) this._matchRef.remove();
    if (this._roomRef) this._roomRef.update({ status: 'abandoned' });
  },

  clearAll: function() {
    const db = firebase.database();
    db.ref('matchQueue').remove();
    db.ref('gameRooms').remove();
    db.ref('playerRooms').remove();
    console.log('[RealtimeMatch] 모든 데이터 초기화됨');
  }
};
