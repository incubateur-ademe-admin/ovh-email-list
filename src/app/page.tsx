"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { Redirection } from "@/types/api";
import {
  fetchDomainsAction,
  fetchRedirectionsByDomainAction,
  createRedirectionsAction,
  deleteRedirectionAction,
} from "@/lib/api-actions";
import {
  createRedirectionSchema,
  addToExistingSchema,
  type CreateRedirectionForm,
  type AddToExistingForm,
} from "@/lib/validations";
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';

interface GroupedByFrom {
  from: string
  redirections: Redirection[]
}

interface DomainGroup {
  domain: string
  fromGroups: GroupedByFrom[]
}

function mergeOptimisticWithServer(
  optimistic: DomainGroup[],
  server: DomainGroup[]
): DomainGroup[] {
  const tempRedirections = new Map<string, Redirection>();

  // Collect all temp redirections
  for (const dg of optimistic) {
    for (const fg of dg.fromGroups) {
      for (const redir of fg.redirections) {
        if (redir.id.startsWith("temp-")) {
          tempRedirections.set(redir.id, redir);
        }
      }
    }
  }

  // Inject temp redirections into server data
  const merged = server.map((dg) => {
    const fromGroups = dg.fromGroups.map((fg) => {
      const mergedRedirections = [...fg.redirections];

      for (const redir of tempRedirections.values()) {
        const existingPairs = new Set(fg.redirections.map(r => `${r.from}->${r.to}`));

        if (!existingPairs.has(`${redir.from}->${redir.to}`)) {
          mergedRedirections.push(redir);
        }
      }

      return {
        ...fg,
        redirections: mergedRedirections,
      };
    });

    return {
      ...dg,
      fromGroups,
    };
  });

  return merged;
}

export default function EmailRedirectionsAdmin() {
  const [domainGroups, setDomainGroups] = useState<DomainGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const searchParams = useSearchParams();
  const initialDomain = searchParams.get('domain') || '';

  // Add to existing "from" form state
  const [addingToFrom, setAddingToFrom] = useState<string | null>(null);

  // Refs for focus management
  const mainHeadingRef = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  // Main form for creating new redirections
  const mainForm = useForm<CreateRedirectionForm>({
    resolver: zodResolver(createRedirectionSchema),
    defaultValues: {
      from: "",
      toList: "",
    },
    mode: "onChange",
  });

  // Form for adding to existing "from" email
  const addForm = useForm<AddToExistingForm>({
    resolver: zodResolver(addToExistingSchema),
    defaultValues: {
      toList: "",
    },
    mode: "onChange",
  });

  const parseEmailList = (emailString: string): string[] => {
    return emailString
      .split(/[,;\n]/)
      .map((email) => email.trim())
      .filter((email) => email.length > 0);
  };

  const announceToScreenReader = (message: string) => {
    if (statusRef.current) {
      statusRef.current.textContent = message;
    }
  };

  const loadData = async () => {
    console.log("loadData called");
    // setLoading(true);
    announceToScreenReader("Chargement des domaines et redirections en cours...");

    try {
      // Fetch domains first
      const domainsResponse = await fetchDomainsAction(initialDomain);
      if (!domainsResponse.success || !domainsResponse.data) {
        const errorMessage = domainsResponse.error || "Échec du chargement des domaines";
        toast({
          title: "Erreur",
          description: errorMessage,
          variant: "destructive",
        });
        announceToScreenReader(`Erreur : ${errorMessage}`);
        return;
      }

      const fetchedDomains = domainsResponse.data;

      // Fetch redirections for each domain
      const domainGroupsPromises = fetchedDomains.map(async (domain) => {
        const redirectionsResponse = await fetchRedirectionsByDomainAction(domain);

        if (!redirectionsResponse.success || !redirectionsResponse.data) {
          console.error(`Failed to load redirections for ${domain}:`, redirectionsResponse.error);
          return { domain, fromGroups: [] };
        }

        const redirections = redirectionsResponse.data.redirections;

        // Group redirections by 'from' email within this domain
        const fromGroups = redirections.reduce((acc: GroupedByFrom[], redirection) => {
          const existingGroup = acc.find((group) => group.from === redirection.from);
          if (existingGroup) {
            existingGroup.redirections.push(redirection);
          } else {
            acc.push({ from: redirection.from, redirections: [redirection] });
          }
          return acc;
        }, []);

        return { domain, fromGroups };
      });

      const fetchedDomainGroups = await Promise.all(domainGroupsPromises);
      // setDomainGroups(fetchedDomainGroups);
      setDomainGroups((previousOptimisticGroups) => {
        return mergeOptimisticWithServer(previousOptimisticGroups, fetchedDomainGroups);
      });

      const totalRedirections = fetchedDomainGroups.reduce(
        (total, dg) => total + dg.fromGroups.reduce((sum, fg) => sum + fg.redirections.length, 0),
        0,
      );
      announceToScreenReader(
        `Chargement terminé. ${fetchedDomains.length} domaines et ${totalRedirections} redirections chargés.`,
      );
    } catch (error) {
      console.error("Failed to load data:", error);
      const errorMessage = "Échec du chargement des données";
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive",
      });
      announceToScreenReader(`Erreur : ${errorMessage}`);
    }
  };

  const handleCreateRedirection = async (data: CreateRedirectionForm) => {
    console.log("handleCreateRedirection called");
    const toEmails = parseEmailList(data.toList);

    // Optimistic update
    const optimisticRedirections: Redirection[] = toEmails.map((to) => ({
      id: `temp-${crypto.randomUUID()}`,
      from: data.from,
      to,
    }));

    const domain = data.from.split("@")[1];

    // Update UI optimistically
    setDomainGroups((prev) => {
      const updated = [...prev];
      const domainGroupIndex = updated.findIndex((dg) => dg.domain === domain);

      if (domainGroupIndex >= 0) {
        const fromGroupIndex = updated[domainGroupIndex].fromGroups.findIndex((fg) => fg.from === data.from);

        if (fromGroupIndex >= 0) {
          // Add to existing from group
          // updated[domainGroupIndex].fromGroups[fromGroupIndex].redirections.push(...optimisticRedirections);
          const existingTo = new Set(
            updated[domainGroupIndex].fromGroups[fromGroupIndex].redirections.map((r) => r.to)
          );
          
          const uniqueRedirs = optimisticRedirections.filter((r) => !existingTo.has(r.to));
          updated[domainGroupIndex].fromGroups[fromGroupIndex].redirections.push(...uniqueRedirs);          
        } else {
          // Create new from group
          updated[domainGroupIndex].fromGroups.push({
            from: data.from,
            redirections: optimisticRedirections,
          });
        }
      } else {
        // Create new domain group
        updated.push({
          domain,
          fromGroups: [{ from: data.from, redirections: optimisticRedirections }],
        });
      }

      return updated;
    });

    // Clear form immediately for better UX
    mainForm.reset();
    announceToScreenReader(`Création de ${toEmails.length} redirection${toEmails.length !== 1 ? "s" : ""} en cours...`);

    startTransition(async () => {
      try {
        const response = await createRedirectionsAction({ from: data.from, toEmails });

        if (!response.success) {
          const errorMessage = response.error || "Échec de la création des redirections";
          toast({
            title: "Erreur",
            description: errorMessage,
            variant: "destructive",
          });
          announceToScreenReader(`Erreur : ${errorMessage}`);
          return;
        }

        const successMessage = `${toEmails.length} redirection${toEmails.length !== 1 ? "s créées" : " créée"} avec succès`;
        toast({
          title: "Succès",
          description: successMessage,
        });
        announceToScreenReader(successMessage);

      } catch (error) {
        console.error("Failed to create redirections:", error);
        const errorMessage = "Échec de la création des redirections";
        toast({
          title: "Erreur",
          description: errorMessage,
          variant: "destructive",
        });
        announceToScreenReader(`Erreur : ${errorMessage}`);
      } finally {
        // Reload data to get real IDs from server
        loadData();
      }
    });
  };

  const handleAddToExisting = async (fromEmail: string, data: AddToExistingForm) => {
    const toEmails = parseEmailList(data.toList);

    // Optimistic update
    const optimisticRedirections: Redirection[] = toEmails.map((to) => ({
      id: `temp-${crypto.randomUUID()}`,
      from: fromEmail,
      to,
    }));

    const domain = fromEmail.split("@")[1];

    // Update UI optimistically
    setDomainGroups((prev) => {
      const updated = [...prev];
      const domainGroupIndex = updated.findIndex((dg) => dg.domain === domain);

      if (domainGroupIndex >= 0) {
        const fromGroupIndex = updated[domainGroupIndex].fromGroups.findIndex((fg) => fg.from === fromEmail);

        if (fromGroupIndex >= 0) {
          // updated[domainGroupIndex].fromGroups[fromGroupIndex].redirections.push(...optimisticRedirections);
          const existingTo = new Set(
            updated[domainGroupIndex].fromGroups[fromGroupIndex].redirections.map((r) => r.to)
          );
          
          const uniqueRedirs = optimisticRedirections.filter((r) => !existingTo.has(r.to));
          updated[domainGroupIndex].fromGroups[fromGroupIndex].redirections.push(...uniqueRedirs);
          
        }
      }

      return updated;
    });

    // Clear form and hide it
    setAddingToFrom(null);
    addForm.reset();
    announceToScreenReader(`Ajout de ${toEmails.length} destination${toEmails.length !== 1 ? "s" : ""} en cours...`);

    startTransition(async () => {
      try {
        const response = await createRedirectionsAction({ from: fromEmail, toEmails });

        if (!response.success) {
          const errorMessage = response.error || "Échec de l'ajout des redirections";
          toast({
            title: "Erreur",
            description: errorMessage,
            variant: "destructive",
          });
          announceToScreenReader(`Erreur : ${errorMessage}`);
          return;
        }

        const successMessage = `${toEmails.length} destination${toEmails.length !== 1 ? "s ajoutées" : " ajoutée"} avec succès`;
        toast({
          title: "Succès",
          description: successMessage,
        });
        announceToScreenReader(successMessage);

      } catch (error) {
        console.error("Failed to add redirections:", error);
        const errorMessage = "Échec de l'ajout des redirections";
        toast({
          title: "Erreur",
          description: errorMessage,
          variant: "destructive",
        });
        announceToScreenReader(`Erreur : ${errorMessage}`);
      } finally {
        // Reload data to get real IDs from server
        loadData();
      }
    });
  };

  const handleDeleteRedirection = async (id: string, fromEmail: string, toEmail: string) => {
    // Optimistic update - remove from UI immediately
    setDomainGroups((prev) => {
      return prev
        .map((domainGroup) => ({
          ...domainGroup,
          fromGroups: domainGroup.fromGroups
            .map((fromGroup) => ({
              ...fromGroup,
              redirections: fromGroup.redirections.filter((r) => r.id !== id),
            }))
            .filter((fromGroup) => fromGroup.redirections.length > 0), // Remove empty from groups
        }))
        .filter((domainGroup) => domainGroup.fromGroups.length > 0); // Remove empty domain groups
    });

    announceToScreenReader(`Suppression de la redirection de ${fromEmail} vers ${toEmail} en cours...`);

    startTransition(async () => {
      try {
        const response = await deleteRedirectionAction({ id, from: fromEmail });

        if (!response.success) {
          const errorMessage = response.error || "Échec de la suppression de la redirection";
          toast({
            title: "Erreur",
            description: errorMessage,
            variant: "destructive",
          });
          announceToScreenReader(`Erreur : ${errorMessage}`);
          return;
        }

        const successMessage = `Redirection de ${fromEmail} vers ${toEmail} supprimée avec succès`;
        toast({
          title: "Succès",
          description: successMessage,
        });
        announceToScreenReader(successMessage);
      } catch (error) {
        console.error("Failed to delete redirection:", error);
        const errorMessage = "Échec de la suppression de la redirection";
        toast({
          title: "Erreur",
          description: errorMessage,
          variant: "destructive",
        });
        announceToScreenReader(`Erreur : ${errorMessage}`);
      } finally {
        // Reload data to get real IDs from server
        loadData();
      }
    });
  };

  const didMount = useRef(false);
  // Le tableau de dépendances vide est normal ici car on veut charger les données une seule fois au montage du composant
  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    setLoading(true);  // uniquement ici
    loadData().finally(() => {
      setLoading(false); // uniquement ici aussi
    });
  }, []);
  

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-12" role="status" aria-live="polite">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-600" aria-hidden="true" />
            <div className="text-lg text-gray-600">Chargement des domaines et redirections...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Screen reader announcements */}
        <div ref={statusRef} className="sr-only" role="status" aria-live="polite" aria-atomic="true" />

        {/* Skip link for keyboard navigation */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded-md z-50 focus-ring"
        >
          Aller au contenu principal
        </a>

        {/* Header */}
        <header className="bg-white border border-gray-200 rounded-lg p-6">
          <Image alt='logo' src="/icon.svg" width={50} height={50}/>
          <h1 ref={mainHeadingRef} className="text-2xl font-semibold text-gray-900">
            Administration des Redirections Email
          </h1>
          <p className="text-gray-600 mt-1">Gérer les règles de redirection email par domaine</p>
          {isPending && (
            <div className="flex items-center gap-2 mt-2 text-sm text-blue-600" role="status" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Traitement en cours...
            </div>
          )}
        </header>

        <main id="main-content">
          {/* Add New Redirection Form */}
          <section aria-labelledby="add-redirection-heading">
            <Card className="border-gray-200 shadow-none bg-white">
              <CardHeader className="bg-gray-50 border-b border-gray-200">
                <CardTitle id="add-redirection-heading" className="flex items-center gap-2 text-lg">
                  <Plus className="h-5 w-5" aria-hidden="true" />
                  Ajouter une Nouvelle Redirection
                </CardTitle>
                <CardDescription>Créer de nouvelles règles de redirection email</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <form onSubmit={mainForm.handleSubmit(handleCreateRedirection)} noValidate>
                  <fieldset className="space-y-4" disabled={isPending}>
                    <legend className="sr-only">Formulaire d&apos;ajout de redirection</legend>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="from-email" className="block text-sm font-medium text-gray-700">
                          Email Source{" "}
                          <span className="text-red-500" aria-label="requis">
                            *
                          </span>
                        </Label>
                        <Input
                          id="from-email"
                          type="email"
                          placeholder="sales@company.com"
                          {...mainForm.register("from")}
                          className={`mt-1 bg-white text-gray-900 placeholder-gray-500 border-gray-300 focus-ring ${
                            mainForm.formState.errors.from ? "border-red-500 focus-ring-red" : ""
                          }`}
                          disabled={isPending}
                          aria-invalid={!!mainForm.formState.errors.from}
                          aria-describedby={mainForm.formState.errors.from ? "from-email-error" : undefined}
                        />
                        {mainForm.formState.errors.from && (
                          <p id="from-email-error" className="mt-1 text-sm text-red-600" role="alert">
                            {mainForm.formState.errors.from.message}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="to-emails" className="block text-sm font-medium text-gray-700">
                          Emails de Destination{" "}
                          <span className="text-red-500" aria-label="requis">
                            *
                          </span>
                        </Label>
                        <Input
                          id="to-emails"
                          placeholder="john@company.com, jane@company.com"
                          {...mainForm.register("toList")}
                          className={`mt-1 bg-white text-gray-900 placeholder-gray-500 border-gray-300 focus-ring ${
                            mainForm.formState.errors.toList ? "border-red-500 focus-ring-red" : ""
                          }`}
                          disabled={isPending}
                          aria-invalid={!!mainForm.formState.errors.toList}
                          aria-describedby="to-emails-help to-emails-error"
                        />
                        <p id="to-emails-help" className="mt-1 text-sm text-gray-500">
                          Séparez les adresses par des virgules, points-virgules ou retours à la ligne
                        </p>
                        {mainForm.formState.errors.toList && (
                          <p id="to-emails-error" className="mt-1 text-sm text-red-600" role="alert">
                            {mainForm.formState.errors.toList.message}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white border-0 disabled:bg-gray-400 disabled:text-gray-200 focus-ring"
                      disabled={!mainForm.formState.isValid || isPending}
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                          Création en cours...
                        </>
                      ) : (
                        "Ajouter les Redirections"
                      )}
                    </Button>
                  </fieldset>
                </form>
              </CardContent>
            </Card>
          </section>

          {/* Domain Groups */}
          <section aria-labelledby="domains-heading" className='mt-8'>
            <h2 id="domains-heading" className="sr-only">
              Redirections par domaine
            </h2>
            <div className="space-y-6">
              {domainGroups.map((domainGroup, domainIndex) => (
                <article key={domainGroup.domain} aria-labelledby={`domain-${domainIndex}-heading`}>
                  <Card className="border-gray-200 shadow-none bg-white">
                    <CardHeader className="bg-blue-50 border-b border-gray-200">
                      <CardTitle id={`domain-${domainIndex}-heading`} className="text-xl text-blue-900">
                        {domainGroup.domain}
                      </CardTitle>
                      <CardDescription>
                        {domainGroup.fromGroups.length} email{domainGroup.fromGroups.length !== 1 ? "s" : ""} source
                        {domainGroup.fromGroups.length !== 1 ? "s" : ""} configuré
                        {domainGroup.fromGroups.length !== 1 ? "s" : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      {domainGroup.fromGroups.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          Aucune redirection configurée pour ce domaine
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-200">
                          {domainGroup.fromGroups.map((fromGroup, fromIndex) => (
                            <section
                              key={fromGroup.from}
                              className="p-6"
                              aria-labelledby={`from-${domainIndex}-${fromIndex}-heading`}
                            >
                              <div className="flex items-center justify-between mb-4">
                                <div>
                                  <h3
                                    id={`from-${domainIndex}-${fromIndex}-heading`}
                                    className="font-medium text-gray-900 font-mono text-lg"
                                  >
                                    {fromGroup.from}
                                  </h3>
                                  <p className="text-sm text-gray-500">
                                    Redirige vers {fromGroup.redirections.length} destination
                                    {fromGroup.redirections.length !== 1 ? "s" : ""}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setAddingToFrom(fromGroup.from)}
                                  className="border-blue-300 text-blue-600 hover:bg-blue-100 hover:border-blue-400 bg-white disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300 focus-ring"
                                  disabled={isPending}
                                  aria-label={`Ajouter une destination pour ${fromGroup.from}`}
                                >
                                  <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                                  Ajouter Destination
                                </Button>
                              </div>

                              {/* Add to existing form */}
                              {addingToFrom === fromGroup.from && (
                                <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                                  <form
                                    onSubmit={addForm.handleSubmit((data) => handleAddToExisting(fromGroup.from, data))}
                                    noValidate
                                  >
                                    <fieldset disabled={isPending}>
                                      <legend className="sr-only">
                                        Ajouter des destinations pour {fromGroup.from}
                                      </legend>
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
                                            disabled={isPending}
                                            aria-invalid={!!addForm.formState.errors.toList}
                                            aria-describedby={
                                              addForm.formState.errors.toList
                                                ? `add-to-error-${fromGroup.from}`
                                                : undefined
                                            }
                                          />
                                          {addForm.formState.errors.toList && (
                                            <p
                                              id={`add-to-error-${fromGroup.from}`}
                                              className="mt-1 text-sm text-red-600"
                                              role="alert"
                                            >
                                              {addForm.formState.errors.toList.message}
                                            </p>
                                          )}
                                        </div>
                                        <Button
                                          type="submit"
                                          className="bg-blue-600 hover:bg-blue-700 text-white border-0 disabled:bg-gray-400 disabled:text-gray-200 focus-ring"
                                          disabled={!addForm.formState.isValid || isPending}
                                        >
                                          {isPending ? (
                                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                          ) : (
                                            "Ajouter"
                                          )}
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          onClick={() => {
                                            setAddingToFrom(null);
                                            addForm.reset();
                                          }}
                                          className="border-gray-300 bg-white text-gray-700 hover:bg-gray-100 hover:border-gray-400 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300 focus-ring-gray"
                                          disabled={isPending}
                                        >
                                          Annuler
                                        </Button>
                                      </div>
                                    </fieldset>
                                  </form>
                                </div>
                              )}

                              {/* Destination tags */}
                              <div
                                className="flex flex-wrap gap-2"
                                role="list"
                                aria-label={`Destinations pour ${fromGroup.from}`}
                              >
                                {fromGroup.redirections.map((redirection) => (
                                  <div key={`${redirection.from}-${redirection.to}-${redirection.id}`} role="listitem">
                                    <Badge
                                      variant="secondary"
                                      className={`bg-gray-100 text-gray-800 border border-gray-300 px-3 py-1 text-sm font-mono flex items-center gap-2 hover:bg-gray-200 hover:border-gray-400 transition-colors ${
                                        redirection.id.startsWith("temp-") ? "opacity-60" : ""
                                      }`}
                                    >
                                      <span>{redirection.to}</span>
                                      <button
                                        onClick={() =>
                                          handleDeleteRedirection(redirection.id, redirection.from, redirection.to)
                                        }
                                        className="text-red-500 hover:text-red-700 ml-1 focus-ring-red bg-transparent disabled:opacity-50 transition-colors rounded"
                                        disabled={isPending}
                                        aria-label={`Supprimer la redirection vers ${redirection.to}`}
                                      >
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
              ))}
            </div>

            {domainGroups.length === 0 && (
              <Card className="border-gray-200 shadow-none bg-white">
                <CardContent className="text-center py-12 bg-white">
                  <div className="text-gray-500">Aucun domaine trouvé</div>
                </CardContent>
              </Card>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
