const PORT = process.env.SIGNALINGPORT || 8088;
const io = require('socket.io')(PORT);

let users = {};
let callingSession = [];

const ERRORCODE = {
    EREGISTER: 1,
    EUNREGISTER: 2,
    ECALL: 3,
    EACALL: 4,
    EDCALL: 5,
    EICEUPDATE: 6,
    EHANGUP: 7
};

io.on('connection', function (socket) {
    console.log('New connection from ' + socket.handshake.address);
    socket.on('register', function (data) {
        if (data.username && data.streamInfo && socket.id) {
            console.log(`A new user named '${data.username}' has been registered (with SocketID = ${socket.id})`);
            users[data.username] = { id: socket.id, streamInfo: data.streamInfo, iceCandidates: [] };
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
            callingSession.forEach(session => {
                if (session.responder == data.username) {
                    io.to(users[session.caller].id).emit('hangup', { username: data.username });
                } else if (session.caller == data.username) {
                    io.to(users[session.responder].id).emit('hangup', { username: data.username });
                }
            });
            callingSession = callingSession.filter(session => session.responder != data.username && session.caller != data.username);
            delete users[data.username];
            socket.leave(socket.id);
        } else {
            console.log(`Invalid unregistration request :\n${JSON.stringify(data, null, 4)}`);
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
    socket.on('call accept', function (data) {
        if (data.caller && data.responder) {
            console.log(`The user '${data.responder}' has answered to '${data.caller}'`);
            io.to(users[data.caller].id).emit('ice receive', { candidate: users[data.responder].iceCandidates });
            io.to(users[data.caller].id).emit('call info', { username: data.responder, streamInfo: users[data.responder].streamInfo });.
            socket.emit('ice receive', { candidate: users[data.caller].iceCandidates });
            socket.emit('call info', { username: data.caller, streamInfo: users[data.caller].streamInfo });
            callingSession.push({ caller: data.caller, responder: data.responder, date: Date.now() });
        } else {
            console.log(`Invalid call accept request :\n${JSON.stringify(data, null, 4)}`);
            socket.emit("error", { error: "Invalid call accept request", code: ERRORCODE.EACALL });
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
            callingSession.forEach(session => {
                if (session.responder == data.username) {
                    io.to(users[session.caller].id).emit('hangup', { username: data.username });
                } else if (session.caller == data.username) {
                    io.to(users[session.responder].id).emit('hangup', { username: data.username });
                }
            });
            callingSession = callingSession.filter(session => session.responder != data.username && session.caller != data.username);
        } else {
            console.log(`Invalid hangup request :\n${JSON.stringify(data, null, 4)}`);
            socket.emit("error", { error: "Invalid hangup request", code: ERRORCODE.EHANGUP });
        }
    });
    socket.on('ice update', function (data) {
        if (data.username && data.candidate && users[data.username]) {
            console.log(`The user called '${data.username}' added to its ICECandidates : ${data.candidate}`);
            users[data.username].iceCandidates.push(data.candidate);
            callingSession.forEach(session => {
                if (session.responder == data.username) {
                    io.to(users[session.caller].id).emit('ice receive', { candidate: data.candidate });
                } else if (session.caller == data.username) {
                    io.to(users[session.responder].id).emit('ice receive', { candidate: data.candidate });
                }
            });
        } else {
            console.log(`Invalid ICE update request :\n${JSON.stringify(data, null, 4)}`);
            socket.emit('error', { error: 'Invalid ICE Update request', code: ERRORCODE.EICEUPDATE });
        }
    });
});

console.log(`Socket.io signaling server listening on port '${PORT}'`);