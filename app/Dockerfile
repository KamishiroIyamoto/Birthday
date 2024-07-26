FROM node:20.2.0
WORKDIR /app
COPY package*.json ./
RUN npm update
RUN npm install
COPY . .
CMD npm start