import { useState, useEffect } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { Loader2, Mail, ShieldCheck, X } from "lucide-react";
import toast from "react-hot-toast";

const EmailVerificationModal = ({ isOpen, onClose, email }) => {
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const { verifyEmail, isVerifyingEmail, resendVerificationOTP, isResendingVerification } = useAuthStore();

  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      return toast.error("Please enter a valid 6-digit code");
    }

    const success = await verifyEmail(email, otp);
    if (success) {
      onClose();
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    const success = await resendVerificationOTP(email);
    if (success) {
      setCooldown(60); // 60 second cooldown
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-md bg-base-100 border border-base-content/10 rounded-2xl shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isVerifyingEmail}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-base-content/40 hover:text-base-content hover:bg-base-200 transition-colors"
        >
          <X className="size-5" />
        </button>

        {/* Icon & Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto size-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <ShieldCheck className="size-7" />
          </div>
          <h2 className="text-2xl font-bold text-base-content">Verify Email</h2>
          <p className="text-base-content/60 text-sm">
            We sent a 6-digit verification code to
          </p>
          <div className="flex items-center justify-center gap-1.5 font-medium text-primary text-sm bg-primary/5 rounded-lg py-1.5 px-3 w-fit mx-auto border border-primary/15">
            <Mail className="size-4" />
            {email}
          </div>
        </div>

        {/* Verification Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="form-control">
            <label className="label justify-center">
              <span className="label-text font-medium text-base-content/75">Enter 6-Digit Code</span>
            </label>
            <input
              type="text"
              maxLength="6"
              placeholder="000000"
              className="input input-bordered text-center text-2xl font-bold tracking-[0.5em] w-full max-w-[240px] mx-auto focus:border-primary focus:outline-none"
              value={otp}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, ""); // Allow only digits
                if (val.length <= 6) setOtp(val);
              }}
              disabled={isVerifyingEmail}
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full gap-2 text-white font-semibold"
            disabled={isVerifyingEmail || otp.length !== 6}
          >
            {isVerifyingEmail ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify & Activate"
            )}
          </button>
        </form>

        {/* Resend Section */}
        <div className="text-center pt-2 border-t border-base-content/5">
          <p className="text-sm text-base-content/60">
            Didn't receive the email?{" "}
            {cooldown > 0 ? (
              <span className="text-primary/60 font-medium">
                Resend in {cooldown}s
              </span>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={isResendingVerification}
                className="link link-primary font-medium focus:outline-none disabled:no-underline"
              >
                {isResendingVerification ? (
                  <span className="loading loading-spinner loading-xs inline-block align-middle mr-1" />
                ) : null}
                Resend Code
              </button>
            )}
          </p>
        </div>

      </div>
    </div>
  );
};

export default EmailVerificationModal;
