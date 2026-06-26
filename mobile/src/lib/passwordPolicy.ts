export const PASSWORD_MIN_LENGTH = 12;

export function passwordPolicyHint(language: "en" | "es") {
  return language === "es"
    ? "Minimo 12 caracteres, con al menos 1 mayuscula, 1 minuscula, 1 numero y 1 caracter especial."
    : "Minimum 12 characters, with at least 1 uppercase, 1 lowercase, 1 number and 1 special character.";
}

export function validatePasswordPolicy(password: string, language: "en" | "es") {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return language === "es"
      ? "La contrasena debe tener al menos 12 caracteres."
      : "Password must be at least 12 characters long.";
  }
  if (!/[A-Z]/.test(password)) {
    return language === "es"
      ? "La contrasena debe incluir al menos una mayuscula."
      : "Password must include at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return language === "es"
      ? "La contrasena debe incluir al menos una minuscula."
      : "Password must include at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return language === "es"
      ? "La contrasena debe incluir al menos un numero."
      : "Password must include at least one number.";
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return language === "es"
      ? "La contrasena debe incluir al menos un caracter especial."
      : "Password must include at least one special character.";
  }
  return null;
}
