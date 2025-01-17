const PORT = process.env.SIGNALINGPORT || 8088;
const io = require('socket.io')(PORT);

let users = {};
let callingSession = {};

const ERRORCODE = {
    EREGISTER: 1,
    EUNREGISTER: 2,
    ECALL: 3,
    EACALL: 4,
    EDCALL: 5,
    EICEUPDATE: 6,
    EHANGUP: 7,
    EANSCALL: 8
};

io.on('connection', function (socket) {
    console.log('New connection from ' + socket.handshake.address);
    socket.on('register', function (data) {
        if (data.username && socket.id) {
            console.log(`A new user named '${data.username}' has been registered (with SocketID = ${socket.id})`);
            users[data.username] = { id: socket.id, iceCandidates: [] };
            socket.join(socket.id);
        } else {
            console.log(`Invalid registration request :\n${JSON.stringify(data, null, 4)}`);
            socket.emit('register error', { error: "Invalid register request.", code: ERRORCODE.EREGISTER });
        }
    });
    socket.on('unregister', function (data) {
        console.log("Unregister Endpoint");
        if (data.username && users[data.username]) {
            console.log(`The user named '${data.username}' has been unregistered.`);
            let found_keys = [];
            Object.keys(callingSession).forEach(key => key.includes(data.username) ? found_keys.push(key) : 0);
            found_keys.forEach(key => delete callingSession[key]);
            delete users[data.username];
            socket.leave(socket.id);
        } else {
            console.log(`Invalid unregistration request :\n${JSON.stringify(data, null, 4)}`);
            if (socket.connected)
                socket.emit('error', { error: "Invalid unregister request.", code: ERRORCODE.EUNREGISTER });
        }
    });
    socket.on('call', function (data) {
        if (data.username && data.usernameToCall && users[data.usernameToCall] && users[data.username]) {
            console.log(`The user named '${data.username}' is calling '${data.usernameToCall}'.`);
            io.to(users[data.usernameToCall].id).emit('called', { username: data.username });
        } else {
            if (data.usernameToCall && !users[data.usernameToCall])
                console.log(`The user named '${data.usernameToCall}' doesn't exist in the users variable.`);
            else
                console.log(`Invalid call request :\n${JSON.stringify(data, null, 4)}`);
            socket.emit('error', { error: "Invalid user called.", code: ERRORCODE.ECALL });
        }
    });
    socket.on('call answer', function (data) {
        if (data.caller && data.responder && data.streamInfo && users[data.responder] && users[data.caller]) {
            io.to(users[data.responder].id).emit('call answer', { username: data.caller, streamInfo: data.streamInfo, candidates: users[data.caller].iceCandidates });
            callingSession[data.caller + '/' + data.responder] = { caller: data.caller, responder: data.responder, date: Date.now() };
        } else {
            console.log(`Invalid call answer request :\n${JSON.stringify(data, null, 4)}`);
            socket.emit("error", { error: "Invalid call answer request", code: ERRORCODE.EANSCALL });
        }
    });
    socket.on('call offer', function (data) {
        if (data.caller && data.responder && users[data.caller] && users[data.responder]) {
            console.log(`The user '${data.responder}' has answered to '${data.caller}'`);
            io.to(users[data.caller].id).emit('call offer', { username: data.responder, streamInfo: data.streamInfo, candidates: users[data.responder].iceCandidates });
        } else {
            console.log(`Invalid call offer request :\n${JSON.stringify(data, null, 4)}`);
            socket.emit("error", { error: "Invalid call offer request", code: ERRORCODE.EACALL });
        }
    });
    socket.on('call deny', function (data) {
        if (data.caller && data.responder) {
            console.log(`The user '${data.responder}' has declined to '${data.caller}'`);
            io.to(users[data.caller].id).emit('call denied', { username: data.responder });
        } else {
            console.log(`Invalid call deny request :\n${JSON.stringify(data, null, 4)}`);
            socket.emit("error", { error: "Invalid call deny request", code: ERRORCODE.EDCALL });
        }
    });
    socket.on('hangup', function (data) {
        if (data.username && users[data.username]) {
            let found_keys = [];
            Object.keys(callingSession).forEach(key => {
                if (key.indexOf(data.username) == 0) {
                    io.to(users[callingSession[key].responder].id).emit('hangup', { username: data.username });
                    found_keys.push(key);
                } else if (key.indexOf(data.username) > 0) {
                    io.to(users[callingSession[key].caller].id).emit('hangup', { username: data.username });
                    found_keys.push(key);
                }
            });
            found_keys.forEach(key => delete callingSession[key]);
        } else {
            console.log(`Invalid hangup request :\n${JSON.stringify(data, null, 4)}`);
            socket.emit("error", { error: "Invalid hangup request", code: ERRORCODE.EHANGUP });
        }
    });
    socket.on('ice update', function (data) {
        if (data.username && data.candidate && users[data.username]) {
            console.log(`The user called '${data.username}' added to its ICECandidates : ${data.candidate.candidate}`);
            users[data.username].iceCandidates.push(data.candidate);
            Object.keys(callingSession).forEach(key => {
                if (key.indexOf(data.username) == 0) {
                    io.to(users[callingSession[key].responder].id).emit('ice receive', { candidate: data.candidate });
                    found_key = key;
                } else if (key.indexOf(data.username) > 0) {
                    io.to(users[callingSession[key].caller].id).emit('ice receive', { candidate: data.candidate });
                    found_key = key;
                }
            });
        } else {
            console.log(`Invalid ICE update request :\n${JSON.stringify(data, null, 4)}`);
            socket.emit('error', { error: 'Invalid ICE Update request', code: ERRORCODE.EICEUPDATE });
        }
    });
});

console.log(`Socket.io signaling server listening on port '${PORT}'`);