"use client"

import { toast } from "sonner"

export function useToast() {
  const toastWrapper = (props: {
    title?: string
    description?: string
    variant?: "default" | "destructive"
  }) => {
    if (props.variant === "destructive") {
      toast.error(props.title || "Erreur", {
        description: props.description,
      })
    } else {
      toast.success(props.title || "Succès", {
        description: props.description,
      })
    }
  }

  return {
    toast: toastWrapper,
  }
}
