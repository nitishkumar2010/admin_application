const express = require("express");
const cors = require("cors");
const reportsRouter = require("./routes/reports");

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/reports", reportsRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
