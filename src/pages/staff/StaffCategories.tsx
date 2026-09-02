import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StaffShell } from "@/components/staff/StaffShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { CATEGORY_THEMES, themeClass } from "@/lib/theme/categoryTheme";
import type { CategoryTheme } from "@/lib/api/catalog";
import {
  createCategory,
  listStaffCategories,
  setCategoryArchived,
  updateCategory,
  type StaffCategory,
} from "@/lib/api/staff";

interface Draft {
  id?: string;
  name: string;
  tagline: string;
  description: string;
  image_url: string;
  theme: CategoryTheme;
  sort_order: number;
  status: "DRAFT" | "ACTIVE";
}

const EMPTY: Draft = {
  name: "",
  tagline: "",
  description: "",
  image_url: "",
  theme: "default",
  sort_order: 0,
  status: "DRAFT",
};

export default function StaffCategories() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["staff-categories"],
    queryFn: () => listStaffCategories(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["staff-categories"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        name: d.name,
        tagline: d.tagline || null,
        description: d.description || null,
        image_url: d.image_url || null,
        theme: d.theme,
        sort_order: d.sort_order,
        status: d.status,
      };
      return d.id ? updateCategory({ id: d.id, ...payload }) : createCategory(payload);
    },
    onSuccess: () => {
      toast.success("Collection saved");
      setDraft(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Could not save this collection"),
  });

  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setCategoryArchived(id, archived),
    onSuccess: (_r, v) => {
      toast.success(v.archived ? "Collection archived" : "Collection restored");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Could not change this collection"),
  });

  const startEdit = (c: StaffCategory) =>
    setDraft({
      id: c.id,
      name: c.name,
      tagline: c.tagline ?? "",
      description: c.description ?? "",
      image_url: c.image_url ?? "",
      theme: (c.theme ?? "default") as CategoryTheme,
      sort_order: c.sort_order,
      status: c.status === "ARCHIVED" ? "DRAFT" : c.status,
    });

  const canCreate = can("CATEGORY_CREATE");
  const canUpdate = can("CATEGORY_UPDATE");
  const canArchive = can("CATEGORY_ARCHIVE");

  return (
    <StaffShell
      title="Collections"
      description="Create, rename, restyle, publish or archive collections — no code required."
      actions={
        canCreate && (
          <Button onClick={() => setDraft({ ...EMPTY })}>New collection</Button>
        )
      }
    >
      {isError && (
        <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message || "Failed to load collections."}
        </p>
      )}

      {draft && (
        <section className="mb-6 rounded-xl border border-border bg-background p-5">
          <h2 className="mb-4 font-serif text-lg">
            {draft.id ? "Edit collection" : "New collection"}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="tagline">Tagline</Label>
              <Input
                id="tagline"
                value={draft.tagline}
                onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={3}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="image">Hero image URL</Label>
              <Input
                id="image"
                value={draft.image_url}
                onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="sort">Sort order</Label>
              <Input
                id="sort"
                type="number"
                value={draft.sort_order}
                onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Theme</Label>
              <Select
                value={draft.theme}
                onValueChange={(v) => setDraft({ ...draft, theme: v as CategoryTheme })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_THEMES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Visibility</Label>
              <Select
                value={draft.status}
                onValueChange={(v) => setDraft({ ...draft, status: v as "DRAFT" | "ACTIVE" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft (hidden from shoppers)</SelectItem>
                  <SelectItem value="ACTIVE">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className={cn("mt-5 rounded-lg p-4", themeClass(draft.theme), "gradient-theme-soft")}>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              Theme preview
            </p>
            <p className="font-serif text-xl text-foreground">{draft.name || "Collection name"}</p>
            <p className="text-sm text-muted-foreground">{draft.tagline || "Tagline goes here"}</p>
          </div>

          <div className="mt-5 flex gap-2">
            <Button
              disabled={!draft.name.trim() || save.isPending || (draft.id ? !canUpdate : !canCreate)}
              onClick={() => save.mutate(draft)}
            >
              Save collection
            </Button>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </section>
      )}

      <div className="space-y-3">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}

        {(data?.categories ?? []).map((c) => (
          <article
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-background p-4"
          >
            <div className="flex items-center gap-4">
              <span
                className={cn(
                  "gradient-theme h-12 w-12 shrink-0 rounded-lg",
                  themeClass(c.theme),
                )}
                aria-hidden
              />
              <div>
                <p className="font-medium">
                  {c.name}{" "}
                  <span className="text-xs text-muted-foreground">/{c.slug}</span>
                </p>
                <p className="text-sm text-muted-foreground">{c.tagline || "No tagline"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={c.status === "ACTIVE" ? "default" : "secondary"}>{c.status}</Badge>
              {canUpdate && (
                <Button size="sm" variant="outline" onClick={() => startEdit(c)}>
                  Edit
                </Button>
              )}
              {canArchive && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={archive.isPending}
                  onClick={() =>
                    archive.mutate({ id: c.id, archived: c.status !== "ARCHIVED" })
                  }
                >
                  {c.status === "ARCHIVED" ? "Restore" : "Archive"}
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </StaffShell>
  );
}
