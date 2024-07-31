const pool = require("./db");
const logger = require("./logger");
try {
    pool.query("CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY, name varchar(255) NOT NULL, username varchar(255) NOT NULL, birthday date, deleted boolean DEFAULT false)");
    pool.query("CREATE TABLE IF NOT EXISTS chats (id serial PRIMARY KEY, name varchar(255) NOT NULL, chat_id varchar(255) NOT NULL, user_id integer NOT NULL, deleted boolean DEFAULT false)");

    const message = "Created tables users and chats";
    logger.info(message);
} catch (err) {
    logger.error(err);
}