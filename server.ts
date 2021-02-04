import express from 'express';
import bodyParser from 'body-parser';
import * as http from 'http';
import DBconfig from './Config/DB.json';
import * as mongo from "mongodb";
import cors from 'cors';

import SHA256 from './SHA256';
import RandomToken from './RandomToken';

import { ClientInfo, ClientUsage, DBAccount, DBServer, DBServerUsage, System } from './Types';
import SocketIO from 'socket.io';

let DB_Client: mongo.MongoClient;
const Monitor = express();
const MonitorServer = http.createServer(Monitor);
const io = SocketIO(MonitorServer);

Monitor.use(cors());
Monitor.use(bodyParser.json());       // to support JSON-encoded bodies
Monitor.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));


Monitor.post('/Monitor/ServerLogin', async (req, res) => {
    if (!req.body) return res.send({err: "WRONG_DATA"});
    let DB = await DB_Client.db();

    let Client: ClientInfo = req.body.ServerInfo;
    let Server: DBServer | null = await DB.collection('Servers').findOne({ macaddr: Client.system.macaddr });

    if (Server) {

		console.log("turn online")
		if (await (await DB.collection('Servers').updateOne({ macaddr: Client.system.macaddr }, { $set: { 'online': true } })).result.ok)
			return res.send({ ok: true });
		else return res.send({ ok: false });

    } else {
        let NewServer: DBServer = {
            ...Client.system,
            name: Client.name,
            usage: [],
            online: true
		}
		

        if (await (await DB.collection('Servers').insertOne(NewServer)).result.ok && await DB.collection('Accounts').updateOne({token: Client.user.token}, {$push: {Servers: Client.system.macaddr}}))
            return res.send({ ok: true });
        else return res.send({ ok: false });
	}
})

Monitor.post('/Monitor/Register', async (req, res) => {
    if (!req.body.name || !req.body.passwd) return res.send({err: "WRONG_DATA"});
    if (req.body.name.length > 11) return res.send({err: "INVAILD_NAME_LENGTH"});
    let DB = await DB_Client.db();

    if (!await DB.collection('Accounts').findOne({ name: req.body.name })) {
        let token: string;
        while (true) {
            token = RandomToken(30);
            if (await DB.collection('Accounts').findOne({ token: token }) != null) continue;
            break;
        }
        if (!await (await DB.collection('Accounts').insertOne({ name: req.body.name, passwd: SHA256(req.body.passwd), token: token, Servers: [] })).result.ok) return res.send("ERROR_WHILE_CREATE_ACCOUNT");
        else return res.send({ name: req.body.name, token: token });
    } else res.send({err: "USER_EXISTS"});
})

Monitor.post('/Monitor/Login', async (req, res) => {
    if (!req.body.name || !req.body.passwd) return res.send({err: "WRONG_DATA"});
    let DB = await DB_Client.db();

    let Account: DBAccount | null = await DB.collection('Accounts').findOne({ name: req.body.name, passwd: SHA256(req.body.passwd) });
    if (Account) {
        res.send({
            name: Account.name,
            token: Account.token
        });
    } else res.send({err: "LOGIN_FAILD"});
})

Monitor.post('/Monitor/GetServer', async (req, res) => {
    if (!req.body.macaddr) return res.send({err: "WRONG_DATA"});
    let DB = await DB_Client.db();

    let Server: DBServer | null = await DB.collection('Servers').findOne({macaddr: req.body.macaddr});
    if (Server) {
		return res.send({Server: Server});
    } else {
		return res.send({err: "NOT_FOUND"});
	}
})

Monitor.post('/Monitor/GetServers', async (req, res) => {
    if (!req.body.token) return res.send({err: "WRONG_DATA"});
    let DB = await DB_Client.db();

    let Account: DBAccount | null = await DB.collection('Accounts').findOne({token: req.body.token});
    if (Account) {
        let Servers: Array<DBServer> = [];

        for (const Macaddr of Account.Servers) {
            let Server: DBServer | null = await DB.collection('Servers').findOne({macaddr: Macaddr});

            if (Server)
                Servers.push(Server)
        }

        res.send({Servers: Servers});
    } else {
        res.send({err: "NOT_FOUND"});
    }

})

Monitor.post('/Monitor/RemoveServer', async (req, res) => {
    if (!req.body.token || !req.body.macaddr) return res.send({err: "WRONG_DATA"});
    let DB = await DB_Client.db();
    if (req.body.token == "test") return res.send({msg: "DELETED"});
    if (req.body.macaddr == "test") return res.send({err: "NOT_FOUND"});
    if (req.body.macaddr == "test1") return res.send({err: "FAIL_AUTHORIZE"});

    let Account: DBAccount | null = await DB.collection('Accounts').findOne({token: req.body.token});
    if (Account) {
        if (await DB.collection('Servers').findOne({macaddr: req.body.macaddr})) {
            await DB.collection('Servers').deleteOne({macaddr: req.body.macaddr});
            res.send({msg: "DELETED"});
        } else {
            res.send({err: "NOT_FOUND"});
        }
    } else {
        res.send({err: "FAIL_AUTHORIZE"});
    }
})

MonitorServer.listen(8898, async () => {
    const DB_config: mongo.MongoClientOptions = {
        useUnifiedTopology: true,
        poolSize: 10
	}
	
    DB_Client = await mongo.MongoClient.connect(`mongodb://${DBconfig.user}:${DBconfig.pwd}@${DBconfig.host}/${DBconfig.DataBase}`, DB_config);
    
    let ConnectedSocket = 0;
    io.on("connect", async Client => {
        console.log("Connection", ++ConnectedSocket);
        if (!Client.handshake.query.data) {
            Client.emit("Error", {msg: "WRONG_DATA"});
            return Client.disconnect();
        }

        let DB = await DB_Client.db();
        
        let ClientData: ClientInfo;
        try {
            ClientData = JSON.parse(Client.handshake.query.data);
        } catch (err) {
            Client.emit("Error", {msg: "WRONG_DATA_PARSE_ERR"});
            return Client.disconnect();
        }
        
        let Server: DBServer | null = await DB.collection('Servers').findOne({ macaddr: ClientData.system.macaddr });
        if (Server) {
            console.log(Server.name);
            if (await (await DB.collection('Servers').updateOne({ macaddr: ClientData.system.macaddr }, { $set: { 'online': true } })).result.ok)
                Client.emit("Status", { ok: true });
            else Client.emit("Status", { ok: false });

        } else {
            console.log("Createing New Server");
            let NewServer: DBServer = {
                ...ClientData.system,
                name: ClientData.name,
                usage: [],
                online: true
            }
            

            if (await (await DB.collection('Servers').insertOne(NewServer)).result.ok && await DB.collection('Accounts').updateOne({token: ClientData.user.token}, {$push: {Servers: ClientData.system.macaddr}}))
                Client.emit("Status", { ok: true });
            else Client.emit("Status", { ok: false });
        }


        Client.on("UsageUpdate", async (Usage: DBServerUsage) => {
            let Server: DBServer | null = await DB.collection('Servers').findOne({macaddr: ClientData.system.macaddr});
            if (!Server) {
                Client.emit("Error", {msg: "WRONG_DATA"});
                return Client.disconnect();
            }

            let DiskUsage = Usage.Drives;
            delete Usage.Drives;

            Usage.date = new Date();
            for (let i = 0; i <= Server.usage.length-10; i++) 
                await DB.collection('Servers').updateOne({macaddr: Server.macaddr}, {$pop: {usage: -1}});
            
            await DB.collection('Servers').updateOne({macaddr: Server.macaddr}, {$set: {Drives: DiskUsage}});
            await DB.collection('Servers').updateOne({macaddr: Server.macaddr}, {$push: {usage: Usage}});
        })

        Client.on("disconnect", async () => {
            --ConnectedSocket;
            let Server: DBServer | null = await DB.collection('Servers').findOne({macaddr: ClientData.system.macaddr});
            console.log("Disconnected", Server?.name);
            if (Server)
                await DB.collection('Servers').updateOne({macaddr: Server.macaddr}, {$set: {online: false}});
        })

    })

    console.log('MonitorServer is online');
})