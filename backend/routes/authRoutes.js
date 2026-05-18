/**
 * Auth Routes
 */

const express        = require("express");
const router         = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { validate, schemas } = require("../middleware/validationMiddleware");
const {
    registerUser,
    loginUser,
    getProfile
} = require("../controllers/authController");

router.post("/register", validate(schemas.register), registerUser);
router.post("/login",    validate(schemas.login),    loginUser);
router.get("/me",        authMiddleware,              getProfile);

module.exports = router;