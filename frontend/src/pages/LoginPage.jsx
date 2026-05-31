import { useState, useCallback } from "react";
import { useAuthStore } from "../store/useAuthStore";
import AuthImagePattern from "../components/AuthImagePattern";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock, Mail, MessageSquare, KeyRound, ShieldCheck } from "lucide-react";
import EmailVerificationModal from "../components/EmailVerificationModal";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// ─── Google SVG Logo ────────────────────────────────────────────────────────
const GoogleLogo = () => (
  <svg width="20" height="20" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

const LoginPage = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1 = email, 2 = OTP + new password
  const [forgotEmail, setForgotEmail] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Email verification modal state
  const [isVerificationOpen, setIsVerificationOpen] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");

  const {
    login,
    isLoggingIn,
    googleLogin,
    isGoogleLoggingIn,
    forgotPassword,
    isSendingOTP,
    resetPassword,
    isResettingPassword,
  } = useAuthStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await login(formData);
    if (res?.verificationRequired) {
      setVerificationEmail(res.email);
      setIsVerificationOpen(true);
    }
  };

  // ─── Google One Tap handler ──────────────────────────────────────────────
  const handleGoogleLogin = useCallback(() => {
    if (!window.google?.accounts?.id) {
      // GSI script may not have loaded yet
      setTimeout(handleGoogleLogin, 300);
      return;
    }

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        if (response.credential) {
          googleLogin(response.credential);
        }
      },
    });

    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // Fallback: render a button if One Tap doesn't show
        const btnDiv = document.getElementById("google-signin-fallback");
        if (btnDiv) {
          btnDiv.innerHTML = "";
          window.google.accounts.id.renderButton(btnDiv, {
            theme: "outline",
            size: "large",
            width: "100%",
            text: "continue_with",
          });
          // Auto-click the rendered button
          const btn = btnDiv.querySelector('[role="button"]');
          if (btn) btn.click();
        }
      }
    });
  }, [googleLogin]);

  // ─── Forgot Password handlers ───────────────────────────────────────────
  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    const success = await forgotPassword(forgotEmail);
    if (success) setForgotStep(2);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!otpValue.trim() || !newPassword.trim()) return;
    const success = await resetPassword(forgotEmail, otpValue, newPassword);
    if (success) {
      closeForgotModal();
    }
  };

  const closeForgotModal = () => {
    setShowForgotModal(false);
    setForgotStep(1);
    setForgotEmail("");
    setOtpValue("");
    setNewPassword("");
    setShowNewPassword(false);
  };

  return (
    <div className="h-screen grid lg:grid-cols-2">
      {/* Left side — form */}
      <div className="flex flex-col justify-center items-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex flex-col items-center gap-2 group">
              <div
                className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20
              transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-primary">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  <path d="M13 7L9 11.5h3.5l-1 4 4.5-5.5h-3.5z" fill="currentColor" className="text-secondary" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold mt-2">Welcome Back</h1>
              <p className="text-base-content/60">Sign in to your account</p>
            </div>
          </div>

          {/* Google Sign-In Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isGoogleLoggingIn}
            className="btn btn-outline w-full gap-3 hover:bg-base-200 border-base-content/20"
          >
            {isGoogleLoggingIn ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <GoogleLogo />
            )}
            Continue with Google
          </button>

          {/* Hidden fallback container for Google button */}
          <div id="google-signin-fallback" className="hidden"></div>

          {/* OR Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-base-content/10"></div>
            <span className="text-base-content/40 text-sm font-medium">OR</span>
            <div className="flex-1 h-px bg-base-content/10"></div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Email</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-base-content/40" />
                </div>
                <input
                  type="email"
                  className={`input input-bordered w-full pl-10`}
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Password</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-base-content/40" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  className={`input input-bordered w-full pl-10`}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-base-content/40" />
                  ) : (
                    <Eye className="h-5 w-5 text-base-content/40" />
                  )}
                </button>
              </div>
            </div>

            {/* Forgot Password link */}
            <div className="text-right -mt-2">
              <button
                type="button"
                className="text-sm link link-primary"
                onClick={() => setShowForgotModal(true)}
              >
                Forgot Password?
              </button>
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={isLoggingIn}>
              {isLoggingIn ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div className="text-center">
            <p className="text-base-content/60">
              Don&apos;t have an account?{" "}
              <Link to="/signup" className="link link-primary">
                Create account
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right side — image pattern */}
      <AuthImagePattern
        title={"Welcome back!"}
        subtitle={"Sign in to continue your conversations and catch up with your messages."}
      />

      {/* ─── Forgot Password Modal ──────────────────────────────────────────── */}
      {showForgotModal && (
        <div className="modal modal-open">
          <div className="modal-box relative max-w-md">
            {/* Close button */}
            <button
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
              onClick={closeForgotModal}
            >
              ✕
            </button>

            {forgotStep === 1 ? (
              /* ── Step 1: Enter Email ───────────────────────────────────── */
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <KeyRound className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Forgot Password</h3>
                    <p className="text-base-content/60 text-sm">Enter your email to receive an OTP</p>
                  </div>
                </div>

                <form onSubmit={handleSendOTP} className="space-y-4">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-medium">Email Address</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-5 w-5 text-base-content/40" />
                      </div>
                      <input
                        type="email"
                        className="input input-bordered w-full pl-10"
                        placeholder="you@example.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary w-full"
                    disabled={isSendingOTP}
                  >
                    {isSendingOTP ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Sending OTP...
                      </>
                    ) : (
                      "Send OTP"
                    )}
                  </button>
                </form>
              </>
            ) : (
              /* ── Step 2: Enter OTP + New Password ─────────────────────── */
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Reset Password</h3>
                    <p className="text-base-content/60 text-sm">
                      Check <span className="font-medium text-base-content">{forgotEmail}</span> for the OTP
                    </p>
                  </div>
                </div>

                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-medium">6-Digit OTP</span>
                    </label>
                    <input
                      type="text"
                      className="input input-bordered w-full text-center tracking-[0.5em] text-xl font-mono"
                      placeholder="000000"
                      maxLength={6}
                      value={otpValue}
                      onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                    />
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-medium">New Password</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-base-content/40" />
                      </div>
                      <input
                        type={showNewPassword ? "text" : "password"}
                        className="input input-bordered w-full pl-10"
                        placeholder="••••••••"
                        minLength={6}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-5 w-5 text-base-content/40" />
                        ) : (
                          <Eye className="h-5 w-5 text-base-content/40" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary w-full"
                    disabled={isResettingPassword}
                  >
                    {isResettingPassword ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      "Reset Password"
                    )}
                  </button>

                  <button
                    type="button"
                    className="btn btn-ghost btn-sm w-full"
                    onClick={() => setForgotStep(1)}
                  >
                    ← Back to email
                  </button>
                </form>
              </>
            )}
          </div>
          {/* Modal backdrop */}
          <div className="modal-backdrop" onClick={closeForgotModal}></div>
        </div>
      )}

      <EmailVerificationModal
        isOpen={isVerificationOpen}
        onClose={() => setIsVerificationOpen(false)}
        email={verificationEmail}
      />
    </div>
  );
};
export default LoginPage;
