CREATE UNIQUE INDEX IF NOT EXISTS coordinator_global_priors_cat_role_mv_idx
  ON coordinator_global_priors (task_category, role, model_version)
  WHERE model_version IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS coordinator_global_priors_cat_role_null_idx
  ON coordinator_global_priors (task_category, role)
  WHERE model_version IS NULL;
