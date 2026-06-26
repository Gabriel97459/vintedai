module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    hfKey: process.env.HF_KEY || ''
  });
};
