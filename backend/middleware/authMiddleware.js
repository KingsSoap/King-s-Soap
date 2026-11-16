import supabase from "../supabaseClient.js";

/**
 * Authentication middleware that extracts the Supabase user from the Authorization header.
 * Falls back to req.body.userId or req.query.userId for development/testing flexibility.
 */
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    if (token) {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired authentication token.",
        });
      }

      req.user = user;
      req.authToken = token;
      return next();
    }

    // Deleted fallback for development/testing when userId is provided directly
   

    return res.status(401).json({
      success: false,
      message: "Authentication required. Please provide a valid bearer token.",
    });
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal authentication error.",
    });
  }
};





// Optional authentication for routes supporting signed-in users and guests
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // No token: continue as a guest
    if (!authHeader) {
      req.user = null;
      req.authToken = null;
      return next();
    }

    // Reject malformed Authorization headers
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication header.",
      });
    }

    const token = authHeader.slice("Bearer ".length).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is missing.",
      });
    }

    // Verify the token with Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token.",
      });
    }

    req.user = user;
    req.authToken = token;

    return next();
  } catch (err) {
    console.error("Optional authentication error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal authentication error.",
    });
  }
};




//For discounts - requires a real Supabase session token for routes that manage discounts
//Will eventually add admin check
export const requireTokenAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Sign in to manage discounts.",
            });
        }

        const token = authHeader.slice("Bearer ".length);
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({
                message: "Your session is invalid or has expired.",
            });
        }

        //Make verified user available to later route handlers
        req.user = user;
        req.authToken = token;
        return next();
    } catch (error) {
        console.error("Discount authentication error:", error);
        return res.status(500).json({
            message: "Could not verify your session.",
        });
    }
};



// Require the authenticated user to be an administrator
export const requireAdmin = (req, res, next) => {
  // Make sure authentication middleware ran first
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  // Check the administrator role stored in Supabase
  if (req.user.app_metadata?.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }

  // User is an administrator
  next();
};


