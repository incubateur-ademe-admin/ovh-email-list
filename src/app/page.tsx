"use client";

import { useState, useEffect, useTransition, useRef } from "react";
// `cn` not needed in this file after refactor
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import DomainCard from "@/components/DomainCard";
import { Logo } from "@/components/logo";
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
import { useSearchParams } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";

interface GroupedByFrom {
  from: string
  redirections: Redirection[]
}

interface DomainGroup {
  domain: string
  fromGroups: GroupedByFrom[]
  loading?: boolean
}

function mergeOptimisticWithServer(optimistic: DomainGroup[], server: DomainGroup[]): DomainGroup[] {
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
        const existingPairs = new Set(fg.redirections.map((r) => `${r.from}->${r.to}`));

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
  const initialDomain = searchParams.get("domain") || "";

  // animation removed for domain list — handled intentionally via simple DOM updates

  // Derived progress counters
  const totalDomains = domainGroups.length;
  const loadedDomains = domainGroups.filter((d) => !d.loading).length;

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

      // Ensure alphabetical order from the start. Build a domainGroups array in sorted order.
      const sortedDomains = [...fetchedDomains].sort((a, b) => a.localeCompare(b));
      setDomainGroups((prev) => {
        return sortedDomains.map((d) => {
          const existing = prev.find((p) => p.domain === d);
          if (existing) return { ...existing, loading: true };
          return { domain: d, fromGroups: [], loading: true };
        });
      });

      // Stop global loading so UI renders and domains can arrive progressively
      setLoading(false);

      // Helper to run async map with concurrency limit
      async function mapWithConcurrency<T, U>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<U>) {
        const results: U[] = new Array(items.length);
        let i = 0;
        const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
          while (i < items.length) {
            const idx = i++;
            try {
              results[idx] = await fn(items[idx], idx);
            } catch (e) {
              results[idx] = e as unknown as U;
            }
          }
        });
        await Promise.all(workers);
        return results;
      }

      // Fetch redirections per domain with limited concurrency and update UI as each completes
      const concurrencyLimit = 5;

      await mapWithConcurrency(sortedDomains, concurrencyLimit, async (domain) => {
        const redirectionsResponse = await fetchRedirectionsByDomainAction(domain);

        if (!redirectionsResponse.success || !redirectionsResponse.data) {
          console.error(`Failed to load redirections for ${domain}:`, redirectionsResponse.error);
          // mark domain as loaded but empty
          setDomainGroups((prev) =>
            prev.map((dg) => (dg.domain === domain ? { ...dg, fromGroups: [], loading: false } : dg)),
          );
          return;
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

        const fetchedGroup: DomainGroup = { domain, fromGroups };

        // Merge temp redirections from optimistic UI into this domain and replace placeholder
        setDomainGroups((prev) => {
          const merged = mergeOptimisticWithServer(prev, [fetchedGroup]);
          const mergedDomain = merged[0];
          return prev.map((dg) => (dg.domain === domain ? { ...mergedDomain, loading: false } : dg));
        });
      });

      announceToScreenReader(`Chargement terminé. ${fetchedDomains.length} domaines chargés.`);
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

    // Update UI optimistically (immutable updates)
    setDomainGroups((prev) => {
      const domainExists = prev.some((dg) => dg.domain === domain);

      if (!domainExists) {
        return [
          ...prev,
          { domain, fromGroups: [{ from: data.from, redirections: optimisticRedirections }], loading: false },
        ];
      }

      return prev.map((dg) => {
        if (dg.domain !== domain) return dg;

        const fromGroup = dg.fromGroups.find((fg) => fg.from === data.from);

        if (!fromGroup) {
          return { ...dg, fromGroups: [...dg.fromGroups, { from: data.from, redirections: optimisticRedirections }] };
        }

        const existingTo = new Set(fromGroup.redirections.map((r) => r.to));
        const unique = optimisticRedirections.filter((r) => !existingTo.has(r.to));

        return {
          ...dg,
          fromGroups: dg.fromGroups.map((fg) =>
            fg.from === data.from ? { ...fg, redirections: [...fg.redirections, ...unique] } : fg,
          ),
        };
      });
    });
    mainForm.reset();
    announceToScreenReader(`Création de ${toEmails.length} redirection${toEmails.length !== 1 ? "s" : ""} en cours...`);

    startTransition(async () => {
      try {
        const response = await createRedirectionsAction({ from: data.from, toEmails });

        if (!response.success || !response.data) {
          const errorMessage = response.error || "Échec de la création des redirections";
          toast({ title: "Erreur", description: errorMessage, variant: "destructive" });
          announceToScreenReader(`Erreur : ${errorMessage}`);
          return;
        }

        // Replace temp IDs with server IDs immutably
        const created = response.data;
        setDomainGroups((prev) =>
          prev.map((dg) => {
            if (dg.domain !== domain) return dg;

            return {
              ...dg,
              fromGroups: dg.fromGroups.map((fg) => ({
                ...fg,
                redirections: fg.redirections.map((r) => {
                  if (!r.id.startsWith("temp-")) return r;
                  const match = created.find((c) => c.from === r.from && c.to === r.to);
                  return match ? match : r;
                }),
              })),
            };
          }),
        );

        const successMessage = `${toEmails.length} redirection${toEmails.length !== 1 ? "s créées" : " créée"} avec succès`;
        toast({ title: "Succès", description: successMessage });
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
        // no full reload here: we already reconciled temp IDs with server IDs above
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

    // Update UI optimistically (immutable)
    setDomainGroups((prev) =>
      prev.map((dg) => {
        if (dg.domain !== domain) return dg;
        return {
          ...dg,
          fromGroups: dg.fromGroups.map((fg) => {
            if (fg.from !== fromEmail) return fg;
            const existingTo = new Set(fg.redirections.map((r) => r.to));
            const unique = optimisticRedirections.filter((r) => !existingTo.has(r.to));
            return { ...fg, redirections: [...fg.redirections, ...unique] };
          }),
        };
      }),
    );

    // Clear form and hide it
    setAddingToFrom(null);
    addForm.reset();
    announceToScreenReader(`Ajout de ${toEmails.length} destination${toEmails.length !== 1 ? "s" : ""} en cours...`);

    startTransition(async () => {
      try {
        const response = await createRedirectionsAction({ from: fromEmail, toEmails });

        if (!response.success || !response.data) {
          const errorMessage = response.error || "Échec de l'ajout des redirections";
          toast({ title: "Erreur", description: errorMessage, variant: "destructive" });
          announceToScreenReader(`Erreur : ${errorMessage}`);
          return;
        }

        // Replace temp IDs with server IDs for added destinations
        const created = response.data;
        setDomainGroups((prev) =>
          prev.map((dg) => {
            if (dg.domain !== domain) return dg;
            return {
              ...dg,
              fromGroups: dg.fromGroups.map((fg) => ({
                ...fg,
                redirections: fg.redirections.map((r) => {
                  if (!r.id.startsWith("temp-")) return r;
                  const match = created.find((c) => c.from === r.from && c.to === r.to);
                  return match ? match : r;
                }),
              })),
            };
          }),
        );

        const successMessage = `${toEmails.length} destination${toEmails.length !== 1 ? "s ajoutées" : " ajoutée"} avec succès`;
        toast({ title: "Succès", description: successMessage });
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
        // no full reload here: reconciliation already applied above
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
        // Do not reload all cards. If deletion failed server-side we attempted to show an error above.
        // Optionally, we could re-fetch only the affected domain to reconcile; skip global reload here.
      }
    });
  };

  // Reload when query params change (e.g., clicking a domain link updates ?domain=...)
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!mounted) return;
      setLoading(true);
      try {
        await loadData();
      } finally {
        if (mounted) setLoading(false);
      }
    };

    run();

    return () => {
      mounted = false;
    };
    // re-run when search params change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  // animation handled by useAutoAnimate hook

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
          <Logo ref={mainHeadingRef} size="lg" className="mb-4" />
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
          <section aria-labelledby="domains-heading" className="mt-8">
            <h2 id="domains-heading" className="sr-only">
              Redirections par domaine
            </h2>
              <div className="space-y-6">
                {/* Progress counter */}
                {totalDomains > 0 && (
                  <div className="text-sm text-gray-600 mb-2">
                    Chargement domaines : {loadedDomains} / {totalDomains}
                  </div>
                )}
              {domainGroups.map((domainGroup, domainIndex) => (
                <div key={`${domainGroup.domain}-${domainGroup.loading ? "loading" : "ready"}`}>
                  <DomainCard
                    domainGroup={domainGroup}
                    domainIndex={domainIndex}
                    isPending={isPending}
                    addingToFrom={addingToFrom}
                    setAddingToFrom={setAddingToFrom}
                    addForm={addForm}
                    handleAddToExisting={handleAddToExisting}
                    handleDeleteRedirection={handleDeleteRedirection}
                  />
                </div>
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
