<?xml version="1.0" encoding="UTF-8"?>

<!--
SPDX-FileCopyrightText: 2024 Aleksandr Mezin <mezin.alexander@gmail.com>

SPDX-License-Identifier: GPL-2.0-or-later
-->

<xsl:stylesheet
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    version="1.0">

    <xsl:output method="text" omit-xml-declaration="yes" indent="no"/>
    <xsl:strip-space elements="*"/>

    <xsl:template match="comment()[contains(string(),'SPDX-FileCopyrightText:')]">
        <xsl:value-of select="string()"/>
    </xsl:template>

    <xsl:template match="*"/>

</xsl:stylesheet>
