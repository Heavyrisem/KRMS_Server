// import { mongo, Mongoose } from "mongoose";
import * as mongo from "mongodb";

let DB_Client: mongo.MongoClient;
let DB_Name = "KRMS";


async function GetTest() {
    const DB = await DB_Client.db();
    console.log(await DB.collection('Accounts').find({Servers: { $elemMatch: {macaddr: "FakeServer"} }}));
    // insertTest();
}

async function insertTest() {
    const DB = await DB_Client.db(DB_Name);
    console.log(await DB.collection('Accounts').updateOne({name: "TestUser1"}, {}));
}

export function init() {
    return new Promise(async resolve => {
        const DB_config: mongo.MongoClientOptions = {
            useUnifiedTopology: true,
            poolSize: 2
        }
        DB_Client = await mongo.MongoClient.connect(`mongodb:/`, DB_config);
        GetTest();
    })
}

init();