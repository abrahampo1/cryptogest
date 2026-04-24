import * as React from "react"
import { Eye, EyeOff, Lock } from "lucide-react"
import { cn } from "@/lib/utils"

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  showLockIcon?: boolean
  hint?: React.ReactNode
  error?: boolean
  strength?: "weak" | "medium" | "strong" | null
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    { className, showLockIcon = true, hint, error, strength, disabled, ...props },
    ref
  ) => {
    const [visible, setVisible] = React.useState(false)

    return (
      <div className="w-full">
        <div
          className={cn(
            "group relative flex items-center rounded-md border bg-surface-1 transition-colors duration-150",
            "focus-within:ring-2 focus-within:ring-primary focus-within:border-primary",
            error ? "border-destructive/60" : "border-hairline hover:border-hairline/60",
            disabled && "opacity-50 pointer-events-none"
          )}
        >
          {showLockIcon && (
            <Lock className="absolute left-3 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
          )}
          <input
            type={visible ? "text" : "password"}
            ref={ref}
            disabled={disabled}
            className={cn(
              "flex-1 h-10 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none",
              showLockIcon ? "pl-10" : "pl-3",
              "pr-10",
              className
            )}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            tabIndex={-1}
            className="absolute right-2 h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors duration-150"
            aria-label={visible ? "Hide password" : "Show password"}
          >
            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>

        {strength && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex gap-0.5 flex-1">
              {[0, 1, 2].map((i) => {
                const filled =
                  (strength === "weak" && i === 0) ||
                  (strength === "medium" && i <= 1) ||
                  strength === "strong"
                const color =
                  strength === "weak"
                    ? "bg-destructive"
                    : strength === "medium"
                    ? "bg-warning"
                    : "bg-success"
                return (
                  <div
                    key={i}
                    className={cn(
                      "h-0.5 flex-1 rounded-full transition-colors duration-200",
                      filled ? color : "bg-surface-3"
                    )}
                  />
                )
              })}
            </div>
            <span
              className={cn(
                "text-[11px] capitalize",
                strength === "weak" && "text-destructive",
                strength === "medium" && "text-warning",
                strength === "strong" && "text-success"
              )}
            >
              {strength}
            </span>
          </div>
        )}

        {hint && (
          <p className={cn("mt-1.5 text-[11px]", error ? "text-destructive" : "text-muted-foreground")}>
            {hint}
          </p>
        )}
      </div>
    )
  }
)
PasswordInput.displayName = "PasswordInput"

export function estimatePasswordStrength(pw: string): "weak" | "medium" | "strong" | null {
  if (!pw) return null
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 2) return "weak"
  if (score <= 3) return "medium"
  return "strong"
}
