const { verifyToken, verifyRefresh, errorResponse } = require("@dtwin/config");

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1]; // Extract token from "Bearer <token>"
    const decoded = verifyToken(token);

    req.user = decoded; // Attach decoded user info to `req`
    next();
  } catch (error) {
    errorResponse(res, { message: "Unauthorized: Invalid token" }, error, 401);
  }
};

const refreshMiddleWare = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1]; // Extract token from "Bearer <token>"
    const decoded = verifyRefresh(token);

    req.user = decoded; // Attach decoded user info to `req`
    next();
  } catch (error) {
    errorResponse(res, { message: "Unauthorized: Invalid token" }, error, 401);
  }
};

module.exports = { authMiddleware, refreshMiddleWare };
