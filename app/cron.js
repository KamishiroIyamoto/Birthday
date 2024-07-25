const cron = require("node-cron");
const { TelegramClient, Api} = require("telegram");
const { StringSession } = require("telegram/sessions");
const config = require("./config");
const pool = require("./db");
const {createClient} = require("redis");
const logger = require('./logger');

cron.schedule(/* TODO: вернуть "0 0 * * *"*/"* * * * *", async function () {
    const redisClient = createClient({
        socket: {
            port: process.env.REDIS_PORT,
            host: process.env.REDIS_HOST,
        },
    })
        .on('error', err => logger.error('Redis Client Error. '+err))
        .connect();

    const session = await (await redisClient).get("session");
    if (session !== null) {
        const stringSession = new StringSession(session);

        const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {});
        await client.connect();

        const selectUsers = await pool.query("SELECT * FROM users WHERE deleted = false").then(async (records) => {
            const users = records.rows;

            for (let user of users) {
                let birthday = new Date(user.birthday);

                const currentDate = new Date();
                birthday.setFullYear(currentDate.getFullYear());

                const afterWeek = structuredClone(currentDate);
                afterWeek.setDate(afterWeek.getDate() + 7);

                if (birthday > currentDate && afterWeek >= birthday) {
                    /*const selectChats = await pool.query("SELECT * FROM chats WHERE user_id = $1 AND deleted = false").then(async (records) => {
                        console.log("records.rows");
                        console.log(records.rows);
                        if (records.rows.length === 0) {
                            const title = "День рождения " + user.name + " " + birthday.getDate() + "." + birthday.getMonth() + "." + birthday.getFullYear();
                            const createChat = await client.invoke(
                                new Api.messages.CreateChat({
                                    users: getUsernames(users, user.id),
                                    title: title,
                                })
                            );

                            console.log(createChat);

                            const SQL = `INSERT INTO chats (name, chat_id, user_id)
                                         VALUES ($1, $2, $3)`
                            const result = await pool.query(SQL, [
                                title,
                                createChat.chats[0].chat.id.toString(),
                                user.id
                            ]);

                            logger.info('Create chat '+title);
                        }
                    });*/

                    const title = "День рождения "+user.name+" "+birthday.getDate()+"."+birthday.getMonth()+"."+birthday.getFullYear();
                    const createChat = await client.invoke(
                        new Api.messages.CreateChat({
                            users: getUsernames(users, user.id),
                            title: title,
                        })
                    );

                    console.log(createChat);

                    const SQL = `INSERT INTO chats (name)
                                 VALUES ($1)`
                    const result = await pool.query(SQL, [
                        title,
                    ]);

                    logger.info('Create chat '+title);
                }
            }
        });

        await client.disconnect();
    } else {
        logger.error("ERROR! 401 UNAUTHORIZED");
    }
});

function getUsernames(users, userid) {
    let result = [];
    for (let user of users) {
        if (user.id !== userid) {
            result.push(user.username);
        }
    }

    return result;
}