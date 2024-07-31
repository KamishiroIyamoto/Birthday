const cron = require("node-cron");
const { TelegramClient, Api} = require("telegram");
const { StringSession } = require("telegram/sessions");
const config = require("./config");
const pool = require("./db");
const {createClient} = require("redis");
const logger = require('./logger');

cron.schedule(/*"* * * * *"*/"0 0 * * *", async function () {
    logger.info('Start schedule');

    const redisClient = createClient({
        socket: {
            port: process.env.REDIS_PORT,
            host: process.env.REDIS_HOST,
        },
    })
        .on('error', err => logger.error('Redis Client Error. '+err))
        .connect();

    const session = await (await redisClient).get("session");
    const auth = await (await redisClient).get("auth");

    logger.info('Check session and auth...');

    if (session !== null && auth === 'ok') {
        logger.info('OK');
        logger.info('Connecting to client...');

        const stringSession = new StringSession(session);

        const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {});
        await client.connect();
        logger.info('OK');

        logger.info('Getting users...');
        try {
            const selectUsers = await pool.query("SELECT * FROM users WHERE deleted = false").then(async (records) => {
                logger.info('Query OK');
                const users = records.rows;
                logger.info('Users OK');

                logger.info('Checking user\'s birthday...');
                for (let user of users) {
                    let birthday = new Date(user.birthday);

                    const currentDate = new Date();
                    birthday.setFullYear(currentDate.getFullYear());

                    let number = await (await redisClient).get("number");
                    if (number === null) {
                        number = 10;
                    }

                    const afterFewDays =  structuredClone(currentDate);
                    afterFewDays.setDate(afterFewDays.getDate() + parseInt(number));

                    if (birthday > currentDate && afterFewDays >= birthday) {
                        logger.info('Find birthday!');
                        logger.info('Check chats...');
                        const selectChats = await pool.query("SELECT * FROM chats WHERE user_id = $1 AND deleted = false", [user.id]).then(async (records) => {
                            if (records.rows.length === 0) {
                                logger.info('OK');
                                try {
                                    let mounth = birthday.getMonth() + 1;
                                    if (mounth < 10) {
                                        mounth = "0" + mounth;
                                    }

                                    logger.info('Creating chat...');
                                    const title = "День рождения " + user.name + " " + birthday.getDate() + "." + mounth + "." + birthday.getFullYear();
                                    const createChat = await client.invoke(
                                        new Api.messages.CreateChat({
                                            users: getUsernames(users, user.id),
                                            title: title,
                                        })
                                    );
                                    logger.info('OK');

                                    logger.info('Saving chat id...');
                                    const SQL = `INSERT INTO chats (name, chat_id, user_id)
                                                 VALUES ($1, $2, $3)`
                                    const result = await pool.query(SQL, [
                                        title,
                                        createChat.updates.chats[0].id.toString(),
                                        user.id
                                    ]);

                                    logger.info('OK');
                                    logger.info('Created chat ' + title);
                                } catch (e) {
                                    logger.error("ERROR! Chat isn't created! " + e.message);
                                }
                            }
                        });
                    }
                }
                logger.info('All users checked');
            });
        } catch (e) {
            logger.error("ERROR! "+e.message);
        }

        logger.info('Disconnecting');
        await client.disconnect();
    } else {
        logger.error("ERROR! 401 UNAUTHORIZED");
    }

    logger.info('End schedule');
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