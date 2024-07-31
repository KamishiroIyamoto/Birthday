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

app.get("/", async (req, res) => {
    if (await checkNoAuth()) {
        res.writeHead(302, {
            "Location": "/auth"
        });
        res.end();
    } else {
        let number = await (await redisClient).get("number");
        if (number === null) {
            number = 10;
        }
        const data = {
            number: number
        }
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end(renderTemplate("index", "Дни рождения", data, true));
    }
});

app.get("/auth", async (req, res) => {
    let result = {};

    const phone = req.query.phone;
    if (phone !== undefined) {
        result.phone = phone;
        result.button = "Авторизоваться";
    }

    const code = req.query.code;
    if (code !== undefined) {
        result.code = code;
    }

    const password = req.query.password;
    if (code !== undefined) {
        result.password = password;
    }

    res.writeHead(200, {"Content-Type": "text/html"});
    res.end(renderTemplate("auth", "Авторизация", result));
});

app.get("/test", async (req, res) => {
    const session = await (await redisClient).get("session");
    const stringSession = new StringSession(session);

    const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {});
    await client.connect();

    await client.sendMessage("me", { message: "Hello!" });

    res.writeHead(302, {
        "Location": "/"
    });
    res.end();
});

app.get("/users", async (req, res) => {
    if (await checkNoAuth()) {
        res.writeHead(302, {
            "Location": "/auth"
        });
        res.end();
    } else {
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

                res.writeHead(200, {"Content-Type": "text/html"});
                res.end(renderTemplate("users", "Коллеги", result, true));
            });
        } catch (err) {
            logger.error(err);
            res.sendStatus(500);
        }
    }
});

app.get("/chats", async (req, res) => {
    if (await checkNoAuth()) {
        res.writeHead(302, {
            "Location": "/auth"
        });
        res.end();
    } else {
        try {
            const selectChats = await pool.query("SELECT * FROM chats WHERE deleted = false").then((records) => {
                let chats = records.rows;

                const result = {
                    chats: chats
                };

                res.writeHead(200, {"Content-Type": "text/html"});
                res.end(renderTemplate("chats", "Чаты", result, true));
            });
        } catch (err) {
            logger.error(err);
            res.sendStatus(500)
        }
    }
});

app.get("/signout", async (req, res) => {
    if (await checkNoAuth()) {
        res.writeHead(302, {
            "Location": "/auth"
        });
        res.end();
    } else {
        const stringSession = new StringSession(await (await redisClient).get("session"));
        const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {});
        await client.connect();

        const result = await client.invoke(new Api.auth.LogOut({}));

        await client.disconnect();

        stringSession.close();
        stringSession.delete();

        logger.info('Success logout');

        await (await redisClient).del("session");
        await (await redisClient).del("phoneCodeHash");
        await (await redisClient).del("alreadyAuth");
        await (await redisClient).del("auth");

        res.writeHead(302, {
            "Location": "/"
        });
        res.end();
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

app.post("/users/export", async (req, res) => {
    try {
        const selectUsers = await pool.query("SELECT * FROM users WHERE deleted = false").then((records) => {
            res.json(JSON.stringify(records.rows));
        });
    } catch (err) {
        logger.error(err);
        res.sendStatus(500);
    }
});

app.post("/chats/delete", async (req, res) => {
    if (!req.body) return res.sendStatus(400);

    try {
        const stringSession = new StringSession(await (await redisClient).get("session"));
        const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {});
        await client.connect();

        const deleteChat = await client.invoke(
            new Api.messages.DeleteChat({
                chatId: BigInt(req.body.chat_id),
            })
        );

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
        const session = await (await redisClient).get("session");
        if (session === null) {
            stringSession = new StringSession("");
        } else {
            stringSession = new StringSession(session);
        }

        const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {});
        await client.connect();

        const code = req.body.code;
        if (code === undefined) {
            try {
                const {phoneCodeHash} = await client.sendCode(config, phone);

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

                await (await redisClient).set("auth", 'ok');

                res.writeHead(302, {
                    "Location": "/"
                });
                res.end();
            } catch (e) {
                if (e.errorMessage === "SESSION_PASSWORD_NEEDED") {
                    let password = req.body.password.trim();
                    try {
                        const signInWithPassword = await client.signInWithPassword(config, {
                            password: (hint) => new Promise((resolve) => {
                                resolve(password);
                                return password;
                            }),
                            onError: async (err) => {
                                await (await redisClient).set("auth", 'no');
                                logger.error("Error! 2FA is failed by " + phone + ". " + err.message);

                                res.writeHead(302, {
                                    "Location": "/auth?phone=" + phone + "&code=" + code.trim() + "&password=" + password
                                });
                                res.end();
                            }
                        });

                        await (await redisClient).set("auth", 'ok');
                        await (await redisClient).set("number", 15);
                        logger.info('Success 2FA by ' + phone);

                        res.writeHead(302, {
                            "Location": "/"
                        });
                        res.end();
                    } catch (ex) {
                        await (await redisClient).set("auth", 'no');
                        logger.error("Error! 2FA is failed by " + phone + ". " + ex.message);

                        res.writeHead(302, {
                            "Location": "/auth?phone=" + phone + "&code=" + code.trim() + "&password=" + password
                        });
                        res.end();
                    }
                } else {
                    logger.error("Error! Auth is failed by " + phone + ". " + e.message);

                    res.writeHead(302, {
                        "Location": "/auth?phone=" + phone + "&code=" + code.trim()
                    });
                    res.end();
                }
            }
        } else {
            await (await redisClient).set("auth", 'no');
            res.writeHead(302, {
                "Location": "/auth?phone=" + phone
            });
            res.end();
        }
    }
});

async function checkNoAuth() {
    const auth = await (await redisClient).get("auth");

    return auth !== 'ok';
}

function renderTemplate (templateName, title, data = {}, auth = false) {
    const currentTemplate = fs.readFileSync(path.join(__dirname, `/html/${templateName}.mustache`));
    const renderedCurrentTemplate = mustache.render(currentTemplate.toString(), data);

    const baseData = {
        auth: auth,
        title: title,
        body: renderedCurrentTemplate
    };

    const baseTemplate = fs.readFileSync(path.join(__dirname, "/html/base.mustache"));
    return mustache.render(baseTemplate.toString(), baseData);
}

app.listen(port, () => console.log(`Server has started on port: ${port}`));