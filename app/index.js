const fs = require("fs");
const { TelegramClient, Api} = require("telegram");
const { StringSession } = require("telegram/sessions");
const path = require("path");
const express = require("express");
const pool = require("./db");
const mustache = require("mustache");
const config = require("./config");
const {createClient} = require("redis");
const logger = require('./logger');
const port = 3000;

const app = express();
app.use(express.urlencoded({extended:true}));

const redisClient = createClient({
    socket: {
        port: process.env.REDIS_PORT,
        host: process.env.REDIS_HOST,
    },
})
    .on('error', err => logger.error('Redis Client Error. '+err))
    .connect();

async function checkSession() {
    const session = await (await redisClient).get("session");

    return session === null;
}

app.get("/", async (req, res) => {
    if (await checkSession()) {
        res.writeHead(302, {
            "Location": "/auth"
        });
        res.end();
    } else {
        fs.readFile(path.join(__dirname, "/html/index.html"), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end("Error. Not found.");
                return;
            }
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end(data);
        });
    }
});

app.get("/auth", async (req, res) => {
    fs.readFile(path.join(__dirname, "/html/auth.mustache"), (err, data) => {
        if (err) {
            res.writeHead(500);
            res.end("Error. Not found.");
            return;
        }

        let result = [];

        const phone = req.query.phone;
        if (phone !== undefined) {
            result["phone"] = phone;
            result["button"] = "Авторизоваться";
        }

        const code = req.query.code;
        if (code !== undefined) {
            result["code"] = code;
        }

        const output = mustache.render(data.toString(), result);

        res.writeHead(200, {"Content-Type": "text/html"});
        res.end(output);
    });
});

app.get("/setup", async (req, res) => {
    try {
        await pool.query("CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY, name varchar(255) NOT NULL, username varchar(255) NOT NULL, birthday date, deleted boolean DEFAULT false)");
        await pool.query("CREATE TABLE IF NOT EXISTS chats (id serial PRIMARY KEY, name varchar(255) NOT NULL/*, chat_id varchar(255) NOT NULL, user_id integer NOT NULL*/, deleted boolean DEFAULT false)");

        logger.info('Created tables users and chats');

        res.writeHead(302, {
            "Location": "/"
        });
        res.end();
    } catch (err) {
        logger.error(err);
        res.sendStatus(500);
    }
});

app.get("/users", async (req, res) => {
    if (await checkSession()) {
        res.writeHead(302, {
            "Location": "/auth"
        });
        res.end();
    } else {
        fs.readFile(path.join(__dirname, "/html/users.mustache"), async (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end("Error. Not found.");
                return;
            }

            try {
                const selectUsers = await pool.query("SELECT * FROM users WHERE deleted = false").then((records) => {
                    let users = records.rows;

                    for (let user of users) {
                        let date = new Date(user.birthday);
                        user.birthday = date.toLocaleDateString("ru-RU");
                    }

                    const result = {
                        users: users
                    };
                    const output = mustache.render(data.toString(), result);

                    res.writeHead(200, {"Content-Type": "text/html"});
                    res.end(output);
                });
            } catch (err) {
                logger.error(err);
                res.sendStatus(500);
            }
        });
    }
});

app.get("/chats", async (req, res) => {
    if (await checkSession()) {
        res.writeHead(302, {
            "Location": "/auth"
        });
        res.end();
    } else {
        fs.readFile(path.join(__dirname, "/html/chats.mustache"), async (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end("Error. Not found.");
                return;
            }

            try {
                const selectChats = await pool.query("SELECT * FROM chats WHERE deleted = false").then((records) => {
                    let chats = records.rows;

                    const result = {
                        chats: chats
                    };
                    const output = mustache.render(data.toString(), result);

                    res.writeHead(200, {"Content-Type": "text/html"});
                    res.end(output);
                });
            } catch (err) {
                logger.error(err);
                res.sendStatus(500)
            }
        });
    }
});

app.post("/users/add", async (req, res) => {
    if (!req.body) return res.sendStatus(400);

    try {
        const SQL = `INSERT INTO users (name, username, birthday)
                     VALUES ($1, $2, $3)`
        const result = await pool.query(SQL, [
            req.body.name,
            req.body.username,
            req.body.birthday
        ]);

        logger.info('Create user '+req.body.name);
    } catch (e) {
        logger.error('ERROR! User not added. '+e.message);
    }

    res.writeHead(302, {
        "Location": "/users"
    });
    res.end();
});

app.post("/users/delete", async (req, res) => {
    if (!req.body) return res.sendStatus(400);

    try {
        const SQL = `UPDATE users
                     SET deleted = true
                     WHERE id = $1`
        const result = await pool.query(SQL, [
            req.body.id,
        ]);

        logger.info('Delete user. Id: '+req.body.id);
    } catch (e) {
        logger.error('ERROR! User not deleted. '+e.message);
    }

    res.writeHead(302, {
        "Location": "/users"
    });
    res.end();
});

app.post("/chats/delete", async (req, res) => {
    if (!req.body) return res.sendStatus(400);

    try {
        /*const stringSession = new StringSession(await (await redisClient).get("session"));
        const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {});
        await client.connect();

        const deleteChat = await client.invoke(
            new Api.messages.DeleteChat({
                chatId: BigInt(req.body.chat-id),
            })
        );*/

        const SQL = `UPDATE chats
                     SET deleted = true
                     WHERE id = $1`
        const result = await pool.query(SQL, [
            req.body.id,
        ]);

        logger.info('Delete chat. Id: '+req.body.id);
    } catch (e) {
        logger.error('ERROR! Chat not deleted. '+e.message);
    }

    res.writeHead(302, {
        "Location": "/chats"
    });
    res.end();
});

app.post("/auth", async (req, res) => {
    if (!req.body) return res.sendStatus(400);

    const alreadyAuth = await (await redisClient).get("alreadyAuth");
    if (alreadyAuth === "ok") {
        res.writeHead(302, {
            "Location": "/"
        });
        res.end();
    } else {
        const phone = req.body.phone.trim();

        let stringSession;
        if (await checkSession()) {
            stringSession = new StringSession("");
        } else {
            stringSession = new StringSession(await (await redisClient).get("session"));
        }

        const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {});
        await client.connect();

        const code = req.body.code;
        if (code === undefined) {
            try {
                const {phoneCodeHash} = await client.sendCode({
                    apiId: config.apiId,
                    apiHash: config.apiHash,
                }, phone);

                await (await redisClient).set("phoneCodeHash", phoneCodeHash);
            } catch (e) {
                if (e.message === "logged in right after sending the code") {
                    await (await redisClient).set("alreadyAuth", "ok");
                }
            } finally {
                await (await redisClient).set("session", client.session.save());
            }
        }

        if (code !== undefined && phone !== undefined) {
            const phoneCodeHash = await (await redisClient).get("phoneCodeHash");

            try {
                const signIn = await client.invoke(
                    new Api.auth.SignIn({
                        phoneNumber: phone,
                        phoneCodeHash: phoneCodeHash,
                        phoneCode: code.trim(),
                    })
                );

                logger.info('Success auth by ' + phone);

                // await (await redisClient).set("futureAuthToken", signIn.futureAuthToken);

                res.writeHead(302, {
                    "Location": "/"
                });
                res.end();
            } catch (e) {
                logger.error("Error! Auth is failed by " + phone + ". " + e.message);

                res.writeHead(302, {
                    "Location": "/auth?phone=" + phone + "&code=" + code.trim()
                });
                res.end();
            }
        } else {
            res.writeHead(302, {
                "Location": "/auth?phone=" + phone
            });
            res.end();
        }
    }
});

app.listen(port, () => console.log(`Server has started on port: ${port}`));