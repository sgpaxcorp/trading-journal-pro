export const PASSWORD_MIN_LENGTH = 12;

export type PasswordPolicyTranslator = (en: string, es: string) => string;

export function passwordPolicyHint(L: PasswordPolicyTranslator) {
  return L(
    "Minimum 12 characters, with at least 1 uppercase, 1 lowercase, 1 number and 1 special character.",
    "Minimo 12 caracteres, con al menos 1 mayuscula, 1 minuscula, 1 numero y 1 caracter especial."
  );
}

export function validatePasswordPolicy(
  password: string,
  L: PasswordPolicyTranslator
): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return L(
      "Password must be at least 12 characters long.",
      "La contrasena debe tener al menos 12 caracteres."
    );
  }
  if (!/[A-Z]/.test(password)) {
    return L(
      "Password must include at least one uppercase letter.",
      "La contrasena debe incluir al menos una mayuscula."
    );
  }
  if (!/[a-z]/.test(password)) {
    return L(
      "Password must include at least one lowercase letter.",
      "La contrasena debe incluir al menos una minuscula."
    );
  }
  if (!/[0-9]/.test(password)) {
    return L(
      "Password must include at least one number.",
      "La contrasena debe incluir al menos un numero."
    );
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return L(
      "Password must include at least one special character.",
      "La contrasena debe incluir al menos un caracter especial."
    );
  }
  return null;
}

export function validatePasswordPolicyEn(password: string): string | null {
  return validatePasswordPolicy(password, (en) => en);
}
