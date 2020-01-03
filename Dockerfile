FROM node:10.18.0
ENV NODE_ENV production
WORKDIR c:\\projects\containers
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN npm install
COPY . .
EXPOSE 7979
CMD node app.js