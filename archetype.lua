local context = Context.new()

local template_name = context:prompt_select(
  "Template:",
  "template",
  { "base", "deno" }
)

local project_name
if template_name == "deno" then
  project_name = context:prompt_text("Project name:", "project_name", {
    pattern = "^[a-z0-9][a-z0-9-]{1,57}$",
    help = "2-58 lowercase letters, numbers, or hyphens; cannot start with a hyphen",
  })
else
  project_name = context:prompt_text("Project name:", "project_name", {
    min = 1,
    help = "Converted to kebab-case for the generated directory and repository name",
  })
end

local project_slug = project_name
if template_name == "base" then
  project_slug = Case.Kebab:apply(project_name)
  if project_slug == "" then
    error("project_name must produce a non-empty kebab-case name")
  end
end
context:set("project_slug", project_slug)

context:prompt_text("Author:", "author", { min = 1 })
context:prompt_select("License:", "license", { "MIT", "Apache-2.0" })

local semantic_release = false
if template_name == "deno" then
  semantic_release = context:prompt_confirm(
    "Enable semantic-release and automatic JSR publishing?",
    "semantic_release",
    { default = false }
  )
end

directory.render("shared", context, {
  destination = project_slug,
  if_exists = Existing.Error,
})
directory.render(template_name, context, {
  destination = project_slug,
  if_exists = Existing.Error,
})

if semantic_release then
  directory.render("deno-release", context, {
    destination = project_slug,
    if_exists = Existing.Error,
  })
end
