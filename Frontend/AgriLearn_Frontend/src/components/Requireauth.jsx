import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LOGOUT_EVENT, isLoggedIn } from "../api/auth";

// Optional. Wrap any page that needs a signed-in user:
//   <Route path="/" element={<RequireAuth><CreateCycle /></RequireAuth>} />
// Anyone signed out is sent to /login and brought back here afterwards.
export default function RequireAuth({ children }) {
  const location = useLocation();
  const [signedIn, setSignedIn] = useState(isLoggedIn());

  // authFetch() fires this when the server refuses to renew the session
  useEffect(() => {
    const onLogout = () => setSignedIn(false);
    window.addEventListener(LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(LOGOUT_EVENT, onLogout);
  }, []);

  if (!signedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}