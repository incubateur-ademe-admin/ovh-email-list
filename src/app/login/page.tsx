"use client";

import type React from "react";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { login } from '@/lib/api-actions';

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password) {
      toast.error("Veuillez saisir le mot de passe.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await login(password);

        if (result.success) {
          toast.success("Connexion réussie !");
          // Redirect to main page
          router.push("/");
        } else {
          toast.error(result.error || "Échec de la connexion");
          setPassword("");
        }
      } catch (error) {
        console.error("Login error:", error);
        toast.error("Erreur de connexion");
        setPassword("");
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Header with Logo */}
        <div className="text-center mb-8">
          <Logo size="lg" className="justify-center mb-4" />
          <p className="text-gray-600">Connectez-vous pour accéder à l'interface d'administration</p>
        </div>

        {/* Login Card */}
        <Card className="border-gray-200 shadow-none bg-white">
          <CardHeader className="bg-gray-50 border-b border-gray-200">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="h-5 w-5" aria-hidden="true" />
              Connexion
            </CardTitle>
            <CardDescription>Saisissez le mot de passe administrateur</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleLogin} noValidate>
              <fieldset className="space-y-4" disabled={isPending}>
                <legend className="sr-only">Formulaire de connexion</legend>

                <div>
                  <Label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Mot de passe{" "}
                    <span className="text-red-500" aria-label="requis">
                      *
                    </span>
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Saisissez votre mot de passe"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-white text-gray-900 placeholder-gray-500 border-gray-300 focus-ring pr-10"
                      disabled={isPending}
                      autoComplete="current-password"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus-ring-gray"
                      disabled={isPending}
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white border-0 disabled:bg-gray-400 disabled:text-gray-200 focus-ring"
                  disabled={!password || isPending}
                >
                  {isPending ? "Connexion en cours..." : "Se connecter"}
                </Button>
              </fieldset>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-500">
          <p>Interface d'administration sécurisée</p>
        </div>
      </div>
    </div>
  );
}
