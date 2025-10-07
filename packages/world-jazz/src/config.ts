const getPortFromEnv = () => {
  const port = process.env.PORT;
  if (port) {
    return Number(port);
  }
  return 3000;
};

export const config = {
  port: getPortFromEnv(),
};
