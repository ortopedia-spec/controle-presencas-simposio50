Set-StrictMode -Version 2

function Get-XlsxColumnNumber {
    param([string]$Reference)
    $letters = ([regex]::Match($Reference, '^[A-Za-z]+')).Value.ToUpperInvariant()
    $number = 0
    foreach ($char in $letters.ToCharArray()) { $number = ($number * 26) + ([int]$char - [int][char]'A' + 1) }
    return $number
}

function Read-XlsxXmlEntry {
    param($Archive, [string]$Name)
    $entry = $Archive.GetEntry($Name)
    if ($null -eq $entry) { return $null }
    $stream = $entry.Open()
    try {
        $settings = New-Object System.Xml.XmlReaderSettings
        $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
        $settings.XmlResolver = $null
        $reader = [System.Xml.XmlReader]::Create($stream, $settings)
        try { $doc = New-Object System.Xml.XmlDocument; $doc.XmlResolver = $null; $doc.Load($reader); return $doc }
        finally { $reader.Dispose() }
    }
    finally { $stream.Dispose() }
}

function Read-XlsxFirstWorksheet {
    param([Parameter(Mandatory=$true)][string]$Path)
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $workbook = Read-XlsxXmlEntry $archive 'xl/workbook.xml'
        $relationships = Read-XlsxXmlEntry $archive 'xl/_rels/workbook.xml.rels'
        if ($null -eq $workbook -or $null -eq $relationships) { throw 'XLSX_ESTRUTURA_INVALIDA' }
        $wbn = New-Object System.Xml.XmlNamespaceManager($workbook.NameTable)
        $wbn.AddNamespace('m','http://schemas.openxmlformats.org/spreadsheetml/2006/main')
        $wbn.AddNamespace('r','http://schemas.openxmlformats.org/officeDocument/2006/relationships')
        $sheet = $workbook.SelectSingleNode('//m:sheets/m:sheet[1]', $wbn)
        if ($null -eq $sheet) { throw 'XLSX_SEM_PLANILHA' }
        $relId = $sheet.GetAttribute('id','http://schemas.openxmlformats.org/officeDocument/2006/relationships')
        $rn = New-Object System.Xml.XmlNamespaceManager($relationships.NameTable)
        $rn.AddNamespace('p','http://schemas.openxmlformats.org/package/2006/relationships')
        $relationship = $relationships.SelectSingleNode("//p:Relationship[@Id='$relId']", $rn)
        if ($null -eq $relationship) { throw 'XLSX_RELACIONAMENTO_AUSENTE' }
        $target = $relationship.GetAttribute('Target').Replace('\','/')
        while ($target.StartsWith('../')) { $target = $target.Substring(3) }
        if ($target.StartsWith('/')) { $sheetPath = $target.TrimStart('/') }
        elseif ($target.StartsWith('xl/')) { $sheetPath = $target }
        else { $sheetPath = 'xl/' + $target.TrimStart('/') }

        $shared = @()
        $sharedDoc = Read-XlsxXmlEntry $archive 'xl/sharedStrings.xml'
        if ($null -ne $sharedDoc) {
            $sn = New-Object System.Xml.XmlNamespaceManager($sharedDoc.NameTable)
            $sn.AddNamespace('m','http://schemas.openxmlformats.org/spreadsheetml/2006/main')
            foreach ($si in $sharedDoc.SelectNodes('//m:si',$sn)) {
                $parts = @($si.SelectNodes('.//m:t',$sn) | ForEach-Object { $_.InnerText })
                $shared += ($parts -join '')
            }
        }

        $sheetDoc = Read-XlsxXmlEntry $archive $sheetPath
        if ($null -eq $sheetDoc) { throw 'XLSX_PLANILHA_AUSENTE' }
        $ns = New-Object System.Xml.XmlNamespaceManager($sheetDoc.NameTable)
        $ns.AddNamespace('m','http://schemas.openxmlformats.org/spreadsheetml/2006/main')
        $cells = @($sheetDoc.SelectNodes('//m:sheetData/m:row/m:c',$ns))
        $maxRow = 0; $maxColumn = 0
        foreach ($cell in $cells) {
            $reference = $cell.GetAttribute('r'); $row = [int]([regex]::Match($reference,'\d+$').Value); $column = Get-XlsxColumnNumber $reference
            if ($row -gt $maxRow) { $maxRow = $row }; if ($column -gt $maxColumn) { $maxColumn = $column }
        }
        $dimensions = [int[]]@(($maxRow + 1), ($maxColumn + 1))
        $values = [System.Array]::CreateInstance([object], $dimensions)
        foreach ($cell in $cells) {
            $reference = $cell.GetAttribute('r'); $row = [int]([regex]::Match($reference,'\d+$').Value); $column = Get-XlsxColumnNumber $reference
            $type = $cell.GetAttribute('t'); $valueNode = $cell.SelectSingleNode('./m:v',$ns); $value = if ($null -ne $valueNode) { $valueNode.InnerText } else { '' }
            if ($type -eq 's' -and $value -ne '') { $value = $shared[[int]$value] }
            elseif ($type -eq 'inlineStr') { $value = (@($cell.SelectNodes('.//m:is/m:t',$ns) | ForEach-Object { $_.InnerText }) -join '') }
            elseif ($type -eq 'b') { $value = ($value -eq '1') }
            elseif ($type -notin @('str','e') -and $value -match '^-?\d+(\.\d+)?([Ee][+-]?\d+)?$') { $value = [double]::Parse($value,[Globalization.CultureInfo]::InvariantCulture) }
            $values.SetValue($value,$row,$column)
        }
        [pscustomobject]@{ Values=$values; TotalRows=$maxRow; TotalColumns=$maxColumn; SheetName=$sheet.GetAttribute('name') }
    }
    finally { $archive.Dispose() }
}
