import { NavLink, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { FiEye, FiEyeOff } from "react-icons/fi";



function HomeLogin() {
  const { signInUser } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    const { error } = await signInUser(email, password);

    if (error) {
      setErrorMessage(error.message);
    } else {
      navigate("/Admin");
    }
  };

 return (
  <div className="relative flex min-h-screen items-center justify-center px-4 pt-8 pb-8 md:pt-15">
    <div className="relative w-full max-w-md px-4 md:px-6 py-8 bg-white rounded-lg shadow-lg z-20">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label className="block text-lg md:text-xl font-serif text-gray-800 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Email Address"
              className="w-full h-12 px-4 rounded-lg border border-gray-300 font-sans text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

          <div>
            <label className="block text-lg md:text-xl font-serif text-gray-800 mb-2">
              Password
            </label>

            <div className="relative">
            <input
              type= {showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Password"
              className="w-full h-12 px-4 rounded-lg border border-gray-300 font-sans text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-gray-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label = {showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 px-4 py-2 text-gray-700 cursor-pointer">
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
            </div>
          </div>

          {errorMessage && (
            <p className="font-sans text-base text-red-600">{errorMessage}</p>
          )}

          <button
            type="submit"
            className="w-full h-12 rounded-lg bg-[#8B6B4A] border border-white/30 text-white font-sans text-base md:text-xl transition hover:scale-[1.02] cursor-pointer"
          >
            Log In
          </button>

          <div className="space-y-5 pt-2 text-center">
            <NavLink
              to="/EmailToPWReset"
              className="block font-sans text-base md:text-lg text-gray-800 underline decoration-gray-800/30 underline-offset-4 hover:scale-101"
            >
              Forgot Password?
            </NavLink>

            <Link
              to="/createaccount"
              className="block font-sans text-base md:text-lg text-gray-800 underline decoration-gray-800/30 underline-offset-4 hover:scale-101"
            >
              Create an account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default HomeLogin;