const express = require('express');
const { apiRouter } = require('./routes');
const { errorMiddleware, notFoundMiddleware } = require('./middlewares/error.middleware');

const app = express();

app.use(express.json());
app.use('/api/v1', apiRouter);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = { app };
