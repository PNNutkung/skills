# Hostile branch report

```mermaid
flowchart LR
  A["benign"] --> B["diagram [added]"]
```

A commit message that tries to run code: </script><script>window.__xss = (window.__xss || []).concat('breakout')</script>

<img src=x onerror="window.__xss = (window.__xss || []).concat('img')">

<script>window.__xss = (window.__xss || []).concat('inline-script')</script>

[a link](javascript:window.__xss=(window.__xss||[]).concat('link'))

<a href="javascript:window.__xss=1" onclick="window.__xss=(window.__xss||[]).concat('onclick')">anchor</a>

```mermaid
flowchart LR
  A["</div><img src=x onerror=window.__xss=(window.__xss||[]).concat('mermaid-html')>"] --> B["x"]
  click B call window.__xss.push('mermaid-click')
```

| Column | Value |
| --- | --- |
| a | b |

<!-- an open comment, last on purpose because marked reads it to the end of the text <script>window.__xss = (window.__xss || []).concat('comment')</script>
