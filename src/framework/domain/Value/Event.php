<?php

namespace Domain\Value;

class Event
{
    protected string $label;
    public function getLabel() : string
    {
        return $this->label;
    }

    public function __construct(string $label)
    {
        $this->label = $label;
    }
}
