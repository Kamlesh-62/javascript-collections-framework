<script>
  let { list } = $props()
  let revision = $state(0)
  export function refresh() {
    revision = list.revision
  }
</script>

<p>{revision >= 0 ? list.toArray().join(',') : ''}</p>
