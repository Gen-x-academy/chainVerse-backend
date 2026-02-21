const { app } = require('./app');

const port = Number(process.env.EXPRESS_PORT || 4000);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Express issue server running on port ${port}`);
});
