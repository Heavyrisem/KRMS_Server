import express from 'express';
import socket from 'socket.io';
import {createServer} from 'http';

const app = express();
const server = createServer(app)
const io = socket(server);

server.listen(8898, () => {
    let counter = 0;
    io.on('connection', Client => {
        console.log("conn", ++counter);
        Client.emit("message", "Hello");

        Client.on('disconnect', () => {
            console.log("disconn");
            --counter;
        })
    });

    console.log("listening");
})