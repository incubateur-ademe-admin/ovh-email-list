"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Redirection } from "@/types/api";
import type { UseFormReturn } from "react-hook-form";
import type { AddToExistingForm } from "@/lib/validations";

interface GroupedByFrom {
  from: string;
  redirections: Redirection[];
}

interface DomainGroup {
  domain: string;
  fromGroups: GroupedByFrom[];
  loading?: boolean;
}

type Props = {
  domainGroup: DomainGroup;
  domainIndex: number;
  isPending: boolean;
  addingToFrom: string | null;
  setAddingToFrom: (v: string | null) => void;
  addForm: UseFormReturn<AddToExistingForm>;
  handleAddToExisting: (fromEmail: string, data: AddToExistingForm) => void;
  handleDeleteRedirection: (id: string, fromEmail: string, toEmail: string) => void;
};

export default function DomainCard({
  domainGroup,
  domainIndex,
  isPending,
  addingToFrom,
  setAddingToFrom,
  addForm,
  handleAddToExisting,
  handleDeleteRedirection,
}: Props) {
  return (
    <article aria-labelledby={`domain-${domainIndex}-heading`} aria-busy={domainGroup.loading}>
      <Card className={`border-gray-200 shadow-none bg-white ${domainGroup.loading ? "opacity-60 pointer-events-none" : ""}`}>
        <CardHeader className="bg-blue-50 border-b border-gray-200">
          <CardTitle id={`domain-${domainIndex}-heading`} className="text-xl text-blue-900">
            <Link href={`?domain=${domainGroup.domain}`}>{domainGroup.domain}</Link>
          </CardTitle>
          <CardDescription>
            {domainGroup.fromGroups.length} email{domainGroup.fromGroups.length !== 1 ? "s" : ""} source
            {domainGroup.fromGroups.length !== 1 ? "s" : ""} configuré{domainGroup.fromGroups.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {domainGroup.loading ? (
            <div className="text-center py-8 text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-gray-600" aria-hidden="true" />
              Chargement des redirections...
            </div>
          ) : domainGroup.fromGroups.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Aucune redirection configurée pour ce domaine</div>
          ) : (
            <div className="divide-y divide-gray-200">
              {domainGroup.fromGroups.map((fromGroup, fromIndex) => (
                <section key={fromGroup.from} className="p-6" aria-labelledby={`from-${domainIndex}-${fromIndex}-heading`}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 id={`from-${domainIndex}-${fromIndex}-heading`} className="font-medium text-gray-900 font-mono text-lg">
                        {fromGroup.from}
                      </h3>
                      <p className="text-sm text-gray-500">
                        Redirige vers {fromGroup.redirections.length} destination{fromGroup.redirections.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAddingToFrom(fromGroup.from)}
                      className="border-blue-300 text-blue-600 hover:bg-blue-100 hover:border-blue-400 bg-white disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300 focus-ring"
                      disabled={isPending || domainGroup.loading}
                      aria-label={`Ajouter une destination pour ${fromGroup.from}`}
                    >
                      <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                      Ajouter Destination
                    </Button>
                  </div>

                  {addingToFrom === fromGroup.from && (
                    <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <form onSubmit={addForm.handleSubmit((data) => handleAddToExisting(fromGroup.from, data))} noValidate>
                        <fieldset disabled={isPending || domainGroup.loading}>
                          <legend className="sr-only">Ajouter des destinations pour {fromGroup.from}</legend>
                          <div className="flex gap-3">
                            <div className="flex-1">
                              <Label htmlFor={`add-to-${fromGroup.from}`} className="sr-only">
                                Nouvelles adresses de destination pour {fromGroup.from}
                              </Label>
                              <Input
                                id={`add-to-${fromGroup.from}`}
                                placeholder="Ajouter des emails (virgule, point-virgule ou retour à la ligne)"
                                {...addForm.register("toList")}
                                className={`bg-white text-gray-900 placeholder-gray-500 border-gray-300 focus-ring ${
                                  addForm.formState.errors.toList ? "border-red-500 focus-ring-red" : ""
                                }`}
                                disabled={isPending || domainGroup.loading}
                                aria-invalid={!!addForm.formState.errors.toList}
                                aria-describedby={addForm.formState.errors.toList ? `add-to-error-${fromGroup.from}` : undefined}
                              />
                              {addForm.formState.errors.toList && (
                                <p id={`add-to-error-${fromGroup.from}`} className="mt-1 text-sm text-red-600" role="alert">
                                  {addForm.formState.errors.toList.message}
                                </p>
                              )}
                            </div>
                            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white border-0 disabled:bg-gray-400 disabled:text-gray-200 focus-ring" disabled={!addForm.formState.isValid || isPending || domainGroup.loading}>
                              {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Ajouter"}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => { setAddingToFrom(null); addForm.reset(); }} className="border-gray-300 bg-white text-gray-700 hover:bg-gray-100 hover:border-gray-400 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300 focus-ring-gray" disabled={isPending || domainGroup.loading}>
                              Annuler
                            </Button>
                          </div>
                        </fieldset>
                      </form>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2" role="list" aria-label={`Destinations pour ${fromGroup.from}`}>
                    {fromGroup.redirections.map((redirection) => (
                      <div key={`${redirection.from}-${redirection.to}-${redirection.id}`} role="listitem">
                        <Badge variant="secondary" className={`bg-gray-100 text-gray-800 border border-gray-300 px-3 py-1 text-sm font-mono flex items-center gap-2 hover:bg-gray-200 hover:border-gray-400 transition-colors ${redirection.id.startsWith("temp-") ? "opacity-60" : ""}`}>
                          <span>{redirection.to}</span>
                          <button onClick={() => handleDeleteRedirection(redirection.id, redirection.from, redirection.to)} className="text-red-500 hover:text-red-700 ml-1 focus-ring-red bg-transparent disabled:opacity-50 transition-colors rounded" disabled={isPending || domainGroup.loading} aria-label={`Supprimer la redirection vers ${redirection.to}`}>
                            <X className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </Badge>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </article>
  );
}
