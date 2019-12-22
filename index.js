const io = require('socket.io')(8088);

let users = {};

io.on('connection', function (socket) {
    console.log('New connection from ' + socket.handshake.address);
    socket.on('register', function (data) {
        console.log("Register Endpoint");
        if (data.username && data.streamInfo && socket.id) {
            users[data.username] = { id: socket.id, streamInfo: data.streamInfo };
            socket.join(socket.id);
        } else {
            socket.emit('register error', { error: "Invalid request." });
        }
    });
    socket.on('unregister', function (data) {
        console.log("Unregister Endpoint");
        if (data.username && users[data.username]) {
            users[data.username] = null;
            socket.leave(socket.id);
        } else {
            socket.emit('unregister error', { error: "Invalid request." });
        }
    });
    socket.on('call', function (data) {
        if (data.username && data.usernameToCall && users[data.usernameToCall]) {
            socket.emit('user found', { username: data.usernameToCall, streamInfo: users[data.usernameToCall].streamInfo });
            io.to(users[data.usernameToCall].id).emit('called', { username: data.username, streamInfo: users[data.username].streamInfo });
        } else {
            socket.emit('invalid user', { error: "Invalid user." });
        }
    });
});